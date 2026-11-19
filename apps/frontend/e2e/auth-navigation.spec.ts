import { expect, test, type Page } from '@playwright/test';

type SystemCode = 'INVENTORY' | 'PURCHASES';
type UserRole = 'ADMIN' | 'INVENTORY_MANAGER' | 'PURCHASES_AGENT';

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function accessToken(system: SystemCode, role: UserRole): string {
  const now = Math.floor(Date.now() / 1_000);
  const claims = {
    sub: '00000000-0000-4000-8000-000000000001',
    email: 'admin@techdistribution.test',
    role,
    system,
    iat: now,
    exp: now + 900,
    iss: 'techdistribution-auth',
    aud: 'techdistribution-api',
  };
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.contract-test`;
}

async function mockLogin(page: Page, role: UserRole) {
  await page.route('**/api/auth/login', async (route) => {
    const tokens =
      role === 'ADMIN'
        ? [
            {
              accessToken: accessToken('INVENTORY', 'ADMIN'),
              tokenType: 'Bearer',
              expiresIn: 900,
            },
            {
              accessToken: accessToken('PURCHASES', 'ADMIN'),
              tokenType: 'Bearer',
              expiresIn: 900,
            },
          ]
        : [
            {
              accessToken: accessToken(
                role === 'INVENTORY_MANAGER' ? 'INVENTORY' : 'PURCHASES',
                role,
              ),
              tokenType: 'Bearer',
              expiresIn: 900,
            },
          ];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        error: false,
        statusCode: 200,
        message: 'Acceso concedido',
        data: {
          accessToken: tokens[0].accessToken,
          tokenType: 'Bearer',
          expiresIn: 900,
          tokens,
        },
      }),
    });
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page
    .getByLabel('Correo electrónico')
    .fill('admin@techdistribution.test');
  await page.getByLabel('Contraseña').fill('contract-test-password');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
}

test('un administrador inicia sesión una vez, ve todas sus secciones y consulta sistemas', async ({
  page,
}) => {
  await mockLogin(page, 'ADMIN');
  await page.route('**/api/auth/systems', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        error: false,
        statusCode: 200,
        message: 'Sistemas consultados',
        data: [
          {
            code: 'INVENTORY',
            accessTokenTtlSeconds: 900,
            version: 1,
            createdAt: '2026-11-17T00:00:00.000Z',
            updatedAt: '2026-11-17T00:00:00.000Z',
          },
          {
            code: 'PURCHASES',
            accessTokenTtlSeconds: 600,
            version: 2,
            createdAt: '2026-11-17T00:00:00.000Z',
            updatedAt: '2026-11-17T00:00:00.000Z',
          },
        ],
      }),
    });
  });

  await login(page);
  await expect(page.getByRole('link', { name: 'Productos' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Órdenes de compra' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Configuración' }).click();

  await expect(
    page.getByRole('heading', { name: 'Configuración de sistemas' }),
  ).toBeVisible();
  await expect(page.getByText('15 minutos')).toBeVisible();
  await expect(page.getByText('10 minutos')).toBeVisible();
});

test('un gestor de inventario no ve compras ni administración y recibe acceso denegado', async ({
  page,
}) => {
  await mockLogin(page, 'INVENTORY_MANAGER');
  await login(page);

  await expect(
    page.getByRole('link', { name: 'Órdenes de compra' }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
  await page.evaluate(() => {
    window.history.pushState({}, '', '/administration/users');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(
    page.getByRole('heading', { name: 'Acceso no autorizado' }),
  ).toBeVisible();

  await page.evaluate(() => {
    window.history.pushState({}, '', '/purchases/orders');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(
    page.getByRole('heading', { name: 'Acceso no autorizado' }),
  ).toBeVisible();
});
