import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Rfq } from '@/entities/rfq.entity'
import { RfqItem } from '@/entities/rfq-item.entity'
import { RfqSupplier } from '@/entities/rfq-supplier.entity'
import { Product } from '@/entities/product.entity'
import { Contact } from '@/entities/contact.entity'
import { Business } from '@/entities/business.entity'
import { AuditModule } from '@/modules/audit/audit.module'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { DocumentsModule } from '@/modules/documents/documents.module'
import { RfqsController } from './controllers/rfqs.controller'
import { RfqsService } from './services/rfqs.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Rfq, RfqItem, RfqSupplier, Product, Contact, Business]),
    AuditModule,
    PermissionsModule,
    DocumentsModule,
  ],
  controllers: [RfqsController],
  providers: [RfqsService],
  exports: [RfqsService],
})
export class RfqsModule {}
