/**
 * Entorno común de las pruebas e2e. La base de pruebas es siempre distinta de
 * la de desarrollo: se recrea en cada ejecución.
 */
export function applyTestEnvironment(): void {
  process.env.NODE_ENV = 'test';
  process.env.DOCS_ENABLED = 'true';
  process.env.PORT = '3001';
  process.env.DB_NAME = process.env.DB_TEST_NAME ?? 'auth_db_test';
}

applyTestEnvironment();
