import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaQueryService } from './prisma-query.service';

@Global()
@Module({
  providers: [PrismaService, PrismaQueryService],
  exports: [PrismaService, PrismaQueryService],
})
export class DatabaseModule {}
