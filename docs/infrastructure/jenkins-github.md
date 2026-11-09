# Jenkins conectado con GitHub

Estado: arquitectura futura, todavía no implementada. GitHub seguirá siendo la
fuente de código, revisión y protección de ramas. Jenkins se conectará directamente
a GitHub mediante una GitHub App y webhooks; no depende de GitHub Actions para
recibir eventos.

```text
Desarrollador
    |
    v
GitHub ---- pull request ----> GitHub Actions (validación rápida)
    |
    `---- webhook HTTPS -----> Jenkins Multibranch Pipeline
                                  |
                                  v
                              agentes efímeros
                                  |
                    integración, imágenes y despliegue
```

## División de responsabilidades

### GitHub Actions

La CI actual permanece como retroalimentación rápida para cada push y pull
request:

- formato, lint y pruebas unitarias por stack;
- compilación y validación de migraciones;
- comprobación de Dockerfiles y Compose;
- pruebas acotadas de infraestructura;
- checks requeridos antes de aprobar un pull request.

### Jenkins

Cuando se implemente, Jenkins se encargará de tareas de integración y entrega que
requieren agentes, redes, credenciales o ambientes controlados:

- recorrido completo a través de Nginx, Gateway y dominios;
- pruebas con PostgreSQL, MySQL y Kafka reales;
- análisis de seguridad, SBOM y escaneo de imágenes;
- construcción y publicación de imágenes inmutables;
- despliegue a desarrollo y staging;
- aprobación manual y promoción a producción;
- smoke tests, evidencia, retención y rollback.

No se mantienen dos pipelines idénticos para el mismo evento. GitHub Actions es el
gate rápido de pull requests. Jenkins vuelve a validar lo necesario sobre el commit
protegido que realmente será publicado y agrega integración/CD.

## Integración con GitHub

### Autenticación

- Usar el plugin GitHub Branch Source con autenticación mediante GitHub App.
- Instalar la App únicamente en los repositorios necesarios.
- Conceder permisos mínimos para leer código y pull requests, recibir eventos y
  publicar checks/status; no usar un PAT personal de larga duración.
- Guardar App ID, clave privada y webhook secret en Jenkins Credentials o en el
  gestor externo de secretos, nunca en el repositorio ni en el `Jenkinsfile`.
- Rotar credenciales y registrar auditoría de cambios sin mostrar valores.

### Webhooks

- GitHub entrega eventos por HTTPS al endpoint administrado por el plugin.
- El webhook usa un secreto aleatorio de alta entropía y valida
  `X-Hub-Signature-256` antes de procesar el body.
- El proxy conserva body y headers sin transformarlos antes de la validación.
- Suscribirse solo a eventos necesarios, inicialmente push y pull request.
- Registrar `X-GitHub-Delivery` para detectar duplicados y facilitar redelivery.
- Polling periódico sirve solo como recuperación; no reemplaza al webhook.

### Multibranch Pipeline

El repositorio tendrá un `Jenkinsfile` en la raíz cuando Jenkins se implemente.
Una Multibranch Pipeline descubrirá ramas y pull requests autorizados y ejecutará
el pipeline correspondiente al commit exacto.

- Pull requests no reciben secretos de despliegue.
- Código proveniente de forks no ejecuta etapas privilegiadas.
- `develop`, `main` y tags se procesan con políticas explícitas.
- Los checks publicados usan nombres únicos, por ejemplo `jenkins/integration` y
  `jenkins/deploy-staging`, para no confundirse con jobs de GitHub Actions.

Las reglas de protección de GitHub exigen los checks adecuados y revisiones antes
de fusionar. Solo se acepta como origen del check la GitHub App esperada cuando la
configuración de GitHub lo permita.

## Estrategia de ramas y eventos

| Evento | GitHub Actions | Jenkins |
| --- | --- | --- |
| Pull request | Checks rápidos obligatorios | Integración opcional, sin secretos ni deploy |
| Push a `develop` protegido | Registro del commit | Integración completa y despliegue a desarrollo |
| Push a `main` protegido | Registro del commit | Build publicable y despliegue a staging |
| Tag de versión | Validación mínima del tag/commit | Promoción de la imagen aprobada y producción |
| Ejecución manual/programada | Diagnóstico específico | Recuperación, pruebas largas o mantenimiento |

No se despliega una rama no protegida. Los nombres definitivos de ramas y ambientes
se fijan antes de crear reglas en GitHub y Jenkins.

## Pipeline previsto

1. Checkout del SHA exacto y registro de metadata.
2. Validación de contratos, configuración y secretos accidentales.
3. Build y pruebas de Gateway, Auth, Inventory, Purchases y frontend en paralelo.
4. Integración con Compose, Kafka y recorrido Nginx → Gateway → servicios.
5. Auditoría de dependencias, escaneo de imágenes y generación de SBOM.
6. Build único de imágenes etiquetadas con commit y versión.
7. Publicación en el registry y captura de digest inmutable.
8. Despliegue del mismo digest a desarrollo o staging.
9. Migraciones controladas, health checks y smoke tests.
10. Aprobación manual para producción cuando corresponda.
11. Promoción del mismo digest, verificación y rollback si falla.
12. Publicación de resultado y enlaces de evidencia en GitHub.

Producción nunca reconstruye desde código: promueve el artefacto ya probado. Una
imagen puede tener tags legibles, pero el despliegue se fija por digest; `latest`
no es una referencia de promoción.

## Jenkins y agentes

- El controller administra configuración y scheduling; no compila aplicaciones.
- Builds se ejecutan en agentes efímeros o dedicados con recursos limitados.
- Los agentes ofrecen Node 24/npm 11, JDK 21, Python 3.14, Docker/BuildKit y las
  herramientas de escaneo fijadas por versión.
- Workspaces, contenedores y credenciales temporales se limpian al terminar.
- Las credenciales se inyectan solo en la etapa y ambiente que las necesitan.
- Logs y artefactos tienen retención definida; nunca contienen tokens, passwords,
  cookies, claves privadas ni archivos `.env` reales.
- Plugins y Jenkins core se mantienen en versiones compatibles y soportadas; la
  lista de plugins se versionará como configuración reproducible.

## Red y Nginx

Jenkins es infraestructura administrativa separada del runtime de la plataforma.
No se incluye en `docker-compose.dev.yml`, no atraviesa el API Gateway y no puede
acceder directamente a bases de producción salvo mediante una etapa autorizada.

Si Nginx publica Jenkins:

- usar un virtual host separado, por ejemplo `ci.example.internal`;
- limitar la UI a VPN/SSO o una red administrativa;
- exponer a GitHub únicamente el endpoint de webhook necesario;
- terminar TLS y mantener verificación HTTPS habilitada;
- no compartir cookies, rutas ni configuración CORS con la aplicación;
- preservar body y `X-Hub-Signature-256` del webhook;
- aplicar límites y allowlists sin depender únicamente de IPs estáticas.

El [Nginx de la aplicación](nginx-edge.md) y el proxy administrativo de Jenkins
pueden usar la misma tecnología, pero tienen configuraciones, dominios y redes
separadas.

## Secretos y ambientes

- GitHub contiene código y metadata, no credenciales de ambientes.
- Jenkins Credentials o un secret manager almacena registry, despliegue, GitHub
  App y firmas.
- Desarrollo, staging y producción usan credenciales distintas.
- Aprobaciones de producción requieren identidad auditada y separación de roles.
- Pull requests y agentes no confiables nunca reciben secretos persistentes.
- Los valores sensibles se enmascaran, pero además se evita imprimirlos desde los
  comandos; el masking no sustituye el diseño seguro.

## Aceptación antes de habilitar Jenkins

1. El `Jenkinsfile` se revisa y versiona en la raíz.
2. GitHub App tiene permisos mínimos y está limitada al repositorio.
3. Webhooks HTTPS con firma válida disparan una sola ejecución por entrega.
4. Branches y pull requests se descubren mediante Multibranch Pipeline.
5. Checks de Actions y Jenkins tienen nombres únicos y origen verificable.
6. Un pull request externo no puede leer secretos ni desplegar.
7. El controller no ejecuta builds; agentes se destruyen o limpian.
8. Imágenes se publican una vez y se promueven por digest.
9. Staging y producción tienen aprobación, smoke tests y rollback probado.
10. Jenkins, agentes, registry y ambientes generan logs/auditoría sin secretos.
11. Una caída de Jenkins no bloquea la recuperación manual documentada ni altera
    artefactos ya publicados.
12. GitHub Actions continúa validando pull requests sin depender de Jenkins.

## Archivos futuros

La implementación agregará, como mínimo:

- `Jenkinsfile` en la raíz;
- configuración reproducible de Jenkins y plugins bajo `infrastructure/jenkins/`;
- plantillas de agentes o imágenes de build versionadas;
- runbook de credenciales, backups, actualización y recuperación;
- configuración del registry y ambientes sin secretos embebidos.

Ninguno de esos archivos se crea hasta contar con servidor Jenkins, registry y
destinos de despliegue definidos.

## Referencias oficiales

- [Jenkins Multibranch Pipeline](https://www.jenkins.io/doc/book/pipeline/multibranch/)
- [Jenkins Pipeline as Code](https://www.jenkins.io/doc/book/pipeline-as-code/)
- [Plugin GitHub Branch Source](https://plugins.jenkins.io/github-branch-source)
- [GitHub: validación de webhooks](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [GitHub: protección de ramas y checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
