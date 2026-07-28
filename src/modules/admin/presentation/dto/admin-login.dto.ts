import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/** Admin/moderator credential login — verified against the env credentials. */
export class AdminLoginDto {
  @ApiProperty({ example: 'admin@elon.uz' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'secret123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
