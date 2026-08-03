import { OmitType, PartialType } from '@nestjs/swagger';
import { ListingAudience } from '../../domain/enums/listing-audience.enum';
import type { PatchListingInput } from '../../application/student-listing.io';
import { CreateStudentListingDto } from './create-student-listing.dto';

/**
 * `PATCH /v1/student-listings/{id}` (§7.1).
 *
 * `kind` stays in the shape rather than being omitted: a client that tries to change it should get
 * an explicit 409, not have the field silently dropped. `submit` is omitted — publishing is what
 * `POST /{id}/submit` is for.
 */
export class UpdateStudentListingDto extends PartialType(
  OmitType(CreateStudentListingDto, ['submit'] as const),
) {
  /**
   * Only keys the client actually sent appear in the result, so the service can tell "set this to
   * null" apart from "leave this alone".
   *
   * Named differently from the inherited `toInput()` rather than overriding it: that one fills
   * every absent field with a default, which on a patch would blank out half the listing, so the
   * two must not be interchangeable.
   */
  toPatchInput(): PatchListingInput {
    const input: PatchListingInput = {};

    if (this.kind !== undefined) {
      input.kind = this.kind;
    }
    if (this.title !== undefined) {
      input.title = this.title;
    }
    if (this.description !== undefined) {
      input.description = this.description;
    }
    if (this.images !== undefined) {
      input.images = this.images;
    }
    if (this.priceUnit !== undefined) {
      input.priceUnit = this.priceUnit;
    }
    if (this.price !== undefined) {
      input.price = this.price;
    }
    if (this.priceMax !== undefined) {
      input.priceMax = this.priceMax;
    }
    if (this.isNegotiable !== undefined) {
      input.isNegotiable = this.isNegotiable;
    }
    if (this.contactPhone !== undefined) {
      input.contactPhone = this.contactPhone;
    }
    if (this.universityId !== undefined) {
      input.universityId = this.universityId;
    }
    if (this.audience !== undefined) {
      input.audience = this.audience as ListingAudience;
    }
    if (this.branches !== undefined) {
      input.branches = this.branches.map((branch) => branch.toData());
    }
    if (this.validFrom !== undefined) {
      input.validFrom = new Date(this.validFrom);
    }
    if (this.validTo !== undefined) {
      input.validTo = new Date(this.validTo);
    }
    if (this.attributes !== undefined) {
      input.attributes = this.attributes;
    }
    if (this.optionGroups !== undefined) {
      input.optionGroups = this.optionGroups.map((group) => group.toDomain());
    }
    if (this.details !== undefined) {
      input.details = this.details.toDomain();
    }

    return input;
  }
}
