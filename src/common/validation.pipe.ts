import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToClass, ClassConstructor } from 'class-transformer';

@Injectable()
export class ValidationPipe implements PipeTransform<unknown> {
  async transform(
    value: unknown,
    { metatype }: ArgumentMetadata,
  ): Promise<unknown> {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToClass(
      metatype as ClassConstructor<unknown>,
      value as Record<string, unknown>,
    );
    const errors: ValidationError[] = await validate(
      object as Record<string, unknown>,
    );

    if (errors.length > 0) {
      const errorMessages = errors.map((error) => {
        return Object.values(error.constraints || {}).join(', ');
      });
      throw new BadRequestException({
        message: 'Validation failed',
        errors: errorMessages,
      });
    }

    return object;
  }

  private toValidate(metatype: ClassConstructor<unknown>): boolean {
    const types: ClassConstructor<unknown>[] = [
      String,
      Boolean,
      Number,
      Array,
      Object,
    ];
    return !types.includes(metatype);
  }
}
