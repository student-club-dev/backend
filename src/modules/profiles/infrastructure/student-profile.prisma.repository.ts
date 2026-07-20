import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Profile, ProfilePatch } from '../domain/entities/profile.entity';
import { ProfileRepository } from '../domain/profile.repository';
import { toStudentProfile, toStudentUpdateData } from './profile.mapper';

/** Prisma implementation of ProfileRepository for the `students` table. Prisma is used ONLY here. */
@Injectable()
export class StudentProfilePrismaRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Profile | null> {
    const row = await this.prisma.student.findUnique({ where: { id } });
    return row === null ? null : toStudentProfile(row);
  }

  async findByPhone(phoneNumber: string): Promise<Profile | null> {
    const row = await this.prisma.student.findUnique({ where: { phoneNumber } });
    return row === null ? null : toStudentProfile(row);
  }

  async update(id: string, patch: ProfilePatch): Promise<Profile> {
    const row = await this.prisma.student.update({
      where: { id },
      data: toStudentUpdateData(patch),
    });
    return toStudentProfile(row);
  }
}
