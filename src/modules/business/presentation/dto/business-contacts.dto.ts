import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { BusinessContacts } from '../../domain/entities/business.entity';

/** BusinessContactsDto — social/contact links (matches elon-uz.json). Used in requests and responses. */
export class BusinessContactsDto {
  @ApiPropertyOptional({ nullable: true, example: '@navruz_cafe' })
  @IsOptional()
  @IsString()
  telegram?: string;

  @ApiPropertyOptional({ nullable: true, example: 'navruz.cafe' })
  @IsOptional()
  @IsString()
  instagram?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  website?: string;

  /** Request → domain value object (absent links become null). */
  toDomain(): BusinessContacts {
    return {
      telegram: this.telegram ?? null,
      instagram: this.instagram ?? null,
      website: this.website ?? null,
    };
  }

  static fromDomain(contacts: BusinessContacts): BusinessContactsDto {
    const dto = new BusinessContactsDto();
    dto.telegram = contacts.telegram ?? undefined;
    dto.instagram = contacts.instagram ?? undefined;
    dto.website = contacts.website ?? undefined;
    return dto;
  }
}
