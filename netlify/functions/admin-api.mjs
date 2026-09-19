import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const store = () =>
  getStore({
    name: 'flerte-media',
    consistency: 'strong'
  });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...cors
    }
  });
}

function secret() {
  return process.env.ADMIN_SECRET || '';
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a ?? ''));
  const B = Buffer.from(String(b ?? ''));

  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function tokenFor(user) {
  const payload = `${user}.${Date.now() + 12 * 60 * 60 * 1000}`;

  const sig = crypto
    .createHmac('sha256', secret())
    .update(payload)
    .digest('hex');

  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function validToken(token) {
  if (!token || !secret()) return false;

  try {
    const raw = Buffer.from(token, 'base64url').toString();

    const [user, exp, sig] = raw.split('.');

    if (!user || !exp || !sig || Number(exp) < Date.now()) {
      return false;
    }

    const expected = crypto
      .createHmac('sha256', secret())
      .update(`${user}.${exp}`)
      .digest('hex');

    return (
      sig.length === expected.length &&
      crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expected)
      )
    );
  } catch {
    return false;
  }
}

function auth(request) {
  const authorization =
    request.headers.get('authorization') || '';

  const token = authorization.replace(/^Bearer\s+/i, '');

  return validToken(token);
}
function safeName(name) {
  return String(name || 'foto')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);
}
export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: cors
    });
  }

  const method = request.method;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';

  /*
   * LOGIN
   */
  if (method === 'POST' && action === 'login') {
    let data;

    try {
      data = await request.json();
    } catch {
      return json(400, {
        error: 'Dados de login inválidos.'
      });
    }

    const { username, password } = data;

    if (
      !process.env.ADMIN_USER ||
      !process.env.ADMIN_PASSWORD ||
      !secret()
    ) {
      return json(503, {
        error:
          'O acesso administrativo ainda não foi configurado no Netlify.'
      });
    }

    const okUser = safeEqual(
      username,
      process.env.ADMIN_USER
    );

    const okPass = safeEqual(
      password,
      process.env.ADMIN_PASSWORD
    );

    if (!okUser || !okPass) {
      return json(401, {
        error: 'Utilizador ou palavra-passe incorretos.'
      });
    }

    return json(200, {
      token: tokenFor(process.env.ADMIN_USER),
      expiresIn: 43200
    });
  }

  /*
   * LISTAR IMAGENS
   */
  if (method === 'GET' && action === 'list') {
    try {
      const s = store();

      const result = await s.list({
        prefix: 'images/'
      });

      const images = (result.blobs || []).map((b) => {
        const name = b.key.replace(/^images\//, '');

        return {
          id: name,
          name,
          url:
            `/.netlify/functions/admin-api?action=image&name=` +
            encodeURIComponent(name)
        };
      });

      const setting = await s.get(
        'settings/background'
      );

      return json(200, {
        images,
        background: setting || ''
      });
    } catch (error) {
      console.error('Erro ao listar imagens:', error);

      return json(500, {
        error: 'Não foi possível carregar as imagens.'
      });
    }
  }

  /*
   * MOSTRAR IMAGEM
   */
  if (method === 'GET' && action === 'image') {
    try {
      const name = url.searchParams.get('name');

if (!name) {
  return new Response(
    'Nome da imagem inválido.',
    {
      status: 400,
      headers: cors
    }
  );
}

const blob = await store().get(
  `images/${name}`,
  {
    type: 'arrayBuffer',
    consistency: 'strong'
  }
);

      if (!blob) {
        return new Response(
          'Imagem não encontrada.',
          {
            status: 404,
            headers: cors
          }
        );
      }

      const meta = await store().getMetadata(
        `images/${name}`
      );

      return new Response(blob, {
        status: 200,
        headers: {
          ...cors,
          'Content-Type':
            meta?.metadata?.contentType ||
            'image/jpeg',
          'Cache-Control':
            'public,max-age=31536000,immutable'
        }
      });
    } catch (error) {
      console.error('Erro ao carregar imagem:', error);

      return new Response(
        'Erro ao carregar imagem.',
        {
          status: 500,
          headers: cors
        }
      );
    }
  }

  /*
   * A PARTIR DAQUI É NECESSÁRIO LOGIN
   */
  if (!auth(request)) {
    return json(401, {
      error: 'Não autorizado.'
    });
  }

  /*
   * UPLOAD
   */
  if (method === 'POST' && action === 'upload') {
    try {
      const { name, type, data } =
        await request.json();

      if (
        !data ||
        !String(type || '').startsWith('image/')
      ) {
        return json(400, {
          error: 'Envie uma imagem válida.'
        });
      }

      const base64 = String(data).replace(
        /^data:[^;]+;base64,/,
        ''
      );

      const bytes = Buffer.from(
        base64,
        'base64'
      );

      if (bytes.length > 4 * 1024 * 1024) {
        return json(413, {
          error:
            'A imagem final deve ter no máximo 4 MB.'
        });
      }

      const ext = (
        String(type).split('/')[1] ||
        'jpeg'
      ).replace('svg+xml', 'svg');

      const originalName = String(
        name || `foto-${Date.now()}`
      );

      const filename =
        safeName(originalName) +
        (
          safeName(originalName).includes('.')
            ? ''
            : `.${ext}`
        );

      await store().set(
        `images/${filename}`,
        bytes,
        {
          metadata: {
            contentType: type
          }
        }
      );

      return json(200, {
        ok: true,
        name: filename
      });
    } catch (error) {
      console.error('Erro no upload:', error);

      return json(500, {
        error: 'Não foi possível carregar a imagem.'
      });
    }
  }

  /*
   * DEFINIR BACKGROUND
   */
  if (
    method === 'POST' &&
    action === 'background'
  ) {
    try {
      const { name } =
        await request.json();

      const clean = safeName(name);

      const exists = await store().get(
        `images/${clean}`,
        {
          type: 'arrayBuffer'
        }
      );

      if (!exists) {
        return json(404, {
          error: 'Imagem não encontrada.'
        });
      }

      await store().set(
        'settings/background',
        clean
      );

      return json(200, {
        ok: true,
        background: clean
      });
    } catch (error) {
      console.error(
        'Erro ao definir background:',
        error
      );

      return json(500, {
        error:
          'Não foi possível definir o background.'
      });
    }
  }

  /*
   * APAGAR IMAGEM
   */
  if (
    method === 'DELETE' &&
    action === 'delete'
  ) {
    try {
      const name = safeName(
        url.searchParams.get('name')
      );

      if (!name) {
        return json(400, {
          error: 'Nome inválido.'
        });
      }

      await store().delete(
        `images/${name}`
      );

      return json(200, {
        ok: true
      });
    } catch (error) {
      console.error(
        'Erro ao apagar imagem:',
        error
      );

      return json(500, {
        error:
          'Não foi possível apagar a imagem.'
      });
    }
  }

  return json(404, {
    error: 'Ação não encontrada.'
  });
};
