import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { ServerResponse } from 'node:http';

export function sendGatewayError(
  response: ServerResponse,
  status: number,
  message: string,
): void {
  if (response.writableEnded || response.destroyed) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(
    JSON.stringify({
      error: true,
      source: 'gateway',
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    }),
  );
}

@Catch(HttpException)
export class GatewayExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    sendGatewayError(
      host.switchToHttp().getResponse<ServerResponse>(),
      exception.getStatus(),
      exception.message,
    );
  }
}
