import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ValidationExceptionFilter.name);

  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const exceptionResponse = exception.getResponse() as
      | Record<string, unknown>
      | string;

    // Handle validation errors from class-validator
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as { message?: unknown }).message ||
          'Validation failed';

    const errors = Array.isArray(message) ? message : [message];

    // Format validation errors for better client experience
    const formattedErrors = errors.map((error) => {
      if (typeof error === 'string') {
        return error;
      }

      // Handle class-validator error format
      if (error && typeof error === 'object' && 'property' in error) {
        const constraints =
          (error as { constraints?: Record<string, unknown> }).constraints ||
          {};
        const messages = Object.values(constraints) as string[];
        return `${(error as { property: string }).property}: ${messages.join(', ')}`;
      }

      return String(error);
    });

    this.logger.warn(
      `Validation failed for ${request.method} ${request.url}: ${formattedErrors.join('; ')}`,
    );

    const errorResponse = {
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: 'Validation failed',
      error: 'Bad Request',
      details: formattedErrors,
    };

    response.status(400).json(errorResponse);
  }
}
