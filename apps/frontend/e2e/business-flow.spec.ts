import { expect, test, type Page, type Route } from '@playwright/test';

type SystemCode = 'INVENTORY' | 'PURCHASES';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
const ORDER_ID = '00000000-0000-4000-8000-000000000201';
const NOW = '2026-11-17T20:00:00.000Z';

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function accessToken(system: SystemCode): string {
  const now = Math.floor(Date.now() / 1_000);
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: USER_ID,
    email: 'admin@techdistribution.test',
    role: 'ADMIN',
    system,
    iat: now,
    exp: now + 900,
    iss: 'techdistribution-auth',
    aud: 'techdistribution-api',
  })}.contract-test`;
}

function envelope(
  data: unknown,
  statusCode = 200,
  message = 'Operación exitosa',
) {
  return JSON.stringify({ error: false, statusCode, message, data });
}

async function fulfill(
  route: Route,
  data: unknown,
  statusCode = 200,
  message?: string,
) {
  await route.fulfill({
    status: statusCode,
    contentType: 'application/json',
    body: envelope(data, statusCode, message),
  });
}

async function authenticate(page: Page, system: SystemCode) {
  if (system === 'PURCHASES') {
    await page.getByRole('radio', { name: /Compras/ }).click();
  }
  await page
    .getByLabel('Correo electrónico')
    .fill('admin@techdistribution.test');
  await page.getByLabel('Contraseña').fill('contract-test-password');
  await page.getByRole('button', { name: 'Continuar' }).click();
}

test('producto → orden → snapshot histórico → cancelación', async ({
  page,
}) => {
  let product:
    | {
        id: string;
        sku: string;
        name: string;
        unit: 'UNIT';
        stockOnHand: number;
        active: boolean;
        version: number;
        createdBy: string;
        updatedBy: string;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;
  let order:
    | {
        id: string;
        requesterId: string;
        supplierName: string;
        currency: 'MXN';
        status: 'DRAFT' | 'SUBMITTED' | 'CANCELLED';
        totalAmount: string;
        version: number;
        lastModifiedBy: string;
        submittedAt: string | null;
        cancelledAt: string | null;
        createdAt: string;
        updatedAt: string;
        lines: Array<{
          id: string;
          position: number;
          productId: string;
          skuSnapshot: string;
          nameSnapshot: string;
          unit: string;
          quantity: number;
          unitPrice: string;
          lineTotal: string;
          createdAt: string;
          updatedAt: string;
        }>;
      }
    | undefined;

  const currentOrder = () => {
    if (!order) return undefined;
    return {
      ...order,
      lines: order.lines.map((line) => ({
        ...line,
        currentCatalog: product
          ? {
              sku: product.sku,
              name: product.name,
              unit: product.unit,
              active: product.active,
              stockOnHand: product.stockOnHand,
              entityVersion: product.version,
            }
          : undefined,
      })),
    };
  };

  await page.route('**/api/auth/login', async (route) => {
    const body = route.request().postDataJSON() as { system: SystemCode };
    await fulfill(route, {
      accessToken: accessToken(body.system),
      tokenType: 'Bearer',
      expiresIn: 900,
    });
  });

  await page.route('**/api/inventory/products**', async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      const body = route.request().postDataJSON() as {
        sku: string;
        name: string;
        stockOnHand: number;
      };
      product = {
        id: PRODUCT_ID,
        sku: body.sku,
        name: body.name,
        unit: 'UNIT',
        stockOnHand: body.stockOnHand,
        active: true,
        version: 1,
        createdBy: USER_ID,
        updatedBy: USER_ID,
        createdAt: NOW,
        updatedAt: NOW,
      };
      await fulfill(route, product, 201, 'Producto creado');
      return;
    }
    if (method === 'PUT' && product) {
      const body = route.request().postDataJSON() as {
        sku: string;
        name: string;
        stockOnHand: number;
        active: boolean;
      };
      product = { ...product, ...body, version: product.version + 1 };
      await fulfill(route, product, 200, 'Producto actualizado');
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        error: false,
        statusCode: 200,
        message: 'Productos consultados',
        data: product ? [product] : [],
        meta: {
          page: 1,
          limit: 50,
          total: product ? 1 : 0,
          totalPages: product ? 1 : 0,
        },
      }),
    });
  });

  await page.route('**/api/purchases/orders**', async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (path === '/api/purchases/orders' && method === 'POST') {
      const body = request.postDataJSON() as {
        supplierName: string;
        lines: Array<{ quantity: number; unitPrice: string }>;
      };
      order = {
        id: ORDER_ID,
        requesterId: USER_ID,
        supplierName: body.supplierName,
        currency: 'MXN',
        status: 'DRAFT',
        totalAmount: '2500.00',
        version: 1,
        lastModifiedBy: USER_ID,
        submittedAt: null,
        cancelledAt: null,
        createdAt: NOW,
        updatedAt: NOW,
        lines: [
          {
            id: '00000000-0000-4000-8000-000000000301',
            position: 1,
            productId: PRODUCT_ID,
            skuSnapshot: product?.sku ?? '',
            nameSnapshot: product?.name ?? '',
            unit: 'UNIT',
            quantity: body.lines[0].quantity,
            unitPrice: body.lines[0].unitPrice,
            lineTotal: '2500.00',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      };
      await fulfill(route, currentOrder(), 201, 'Orden creada');
      return;
    }
    if (path.endsWith('/submit') && method === 'POST' && order) {
      order = {
        ...order,
        status: 'SUBMITTED',
        version: order.version + 1,
        submittedAt: NOW,
      };
      await fulfill(route, currentOrder(), 200, 'Orden enviada');
      return;
    }
    if (path.endsWith('/cancel') && method === 'POST' && order) {
      order = {
        ...order,
        status: 'CANCELLED',
        version: order.version + 1,
        cancelledAt: NOW,
      };
      await fulfill(route, currentOrder(), 200, 'Orden cancelada');
      return;
    }
    if (path === `/api/purchases/orders/${ORDER_ID}` && method === 'GET') {
      await fulfill(route, currentOrder());
      return;
    }
    if (path === '/api/purchases/orders' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          error: false,
          statusCode: 200,
          message: 'Órdenes consultadas',
          data: order ? [currentOrder()] : [],
          meta: {
            page: 1,
            limit: 20,
            total: order ? 1 : 0,
            totalPages: order ? 1 : 0,
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, body: 'Ruta simulada no configurada' });
  });

  await page.goto('/login');
  await authenticate(page, 'INVENTORY');
  await page.getByRole('link', { name: 'Productos' }).click();
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await page.getByLabel('SKU').fill('LAP-001');
  await page.getByLabel('Nombre').fill('Laptop Business');
  await page.getByLabel('Existencias iniciales').fill('20');
  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page.getByText('Laptop Business')).toBeVisible();

  await page.getByRole('button', { name: /Inventario/ }).click();
  await page.getByRole('menuitem', { name: 'Conectar otro sistema' }).click();
  await authenticate(page, 'PURCHASES');
  await page.getByRole('button', { name: /Inventario/ }).click();
  await page.getByRole('menuitem', { name: 'Compras' }).click();
  await page.getByRole('link', { name: 'Órdenes de compra' }).click();
  await page.getByRole('link', { name: 'Nueva orden' }).click();

  await page.getByLabel('Proveedor').fill('Proveedor E2E');
  await page.getByRole('combobox').click();
  await page.getByPlaceholder('Buscar por SKU o nombre…').fill('LAP-001');
  await page.getByRole('option', { name: /LAP-001/ }).click();
  await page.getByLabel('Cantidad').fill('2');
  await page.getByLabel('Precio unitario').fill('1250.00');
  await page.getByRole('button', { name: 'Crear orden' }).click();

  await expect(page).toHaveURL(new RegExp(`/purchases/orders/${ORDER_ID}$`));
  await expect(page.getByRole('heading', { name: /Orden 00000000/ })).toBeVisible();
  await expect(page.getByText('Laptop Business', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Enviar orden' }).click();
  await page.getByRole('button', { name: 'Confirmar envío' }).click();
  await expect(page.getByText('Enviada').first()).toBeVisible();

  await page.getByRole('button', { name: /Compras/ }).click();
  await page.getByRole('menuitem', { name: 'Inventario' }).click();
  await page.getByRole('link', { name: 'Productos' }).click();
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Nombre').fill('Laptop Business Pro');
  await page.getByRole('button', { name: 'Guardar versión' }).click();
  await expect(page.getByText('Laptop Business Pro')).toBeVisible();

  await page.getByRole('button', { name: /Inventario/ }).click();
  await page.getByRole('menuitem', { name: 'Compras' }).click();
  await page.getByRole('link', { name: 'Órdenes de compra' }).click();
  await page.getByRole('link', { name: 'Ver' }).click();

  await expect(page.getByText('Laptop Business').first()).toBeVisible();
  await expect(page.getByText('Laptop Business Pro')).toBeVisible();
  await expect(page.getByText('Cambió')).toBeVisible();

  await page.getByRole('button', { name: 'Cancelar orden' }).click();
  await page.getByLabel('Motivo opcional').fill('Cancelación E2E');
  await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(page.getByText('Cancelada').first()).toBeVisible();
});
