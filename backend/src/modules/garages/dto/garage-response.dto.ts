import { ApiProperty } from '@nestjs/swagger';
import { GarageStatus } from '../enums/garage-status.enum';

export class GarageDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Speed Garage' }) name: string;
  @ApiProperty({ nullable: true, type: String, example: 'Plot 12, MIDC' }) addressLine:
    string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Pune' }) city: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Maharashtra' }) state: string | null;
  @ApiProperty({ nullable: true, type: String, example: '411019' }) postalCode: string | null;
  @ApiProperty({ example: '+912012345678' }) phone: string;
  @ApiProperty({ nullable: true, type: String }) email: string | null;
  @ApiProperty({ nullable: true, type: String, example: '27AAAPL1234C1ZV' })
  taxRegistrationNumber: string | null;
  @ApiProperty({ example: 'INR' }) currency: string;
  @ApiProperty({ example: '18.00', description: 'Percent, decimal string' }) taxRate: string;
  @ApiProperty({ example: 'Asia/Kolkata' }) timezone: string;
  @ApiProperty({ enum: GarageStatus }) status: GarageStatus;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

/** Platform-admin list row (UC-19). */
export class AdminGarageListItemDto extends GarageDto {
  @ApiProperty({ example: 4 }) activeStaffCount: number;
  @ApiProperty({ example: 'owner@speedgarage.in', nullable: true, type: String })
  adminEmail: string | null;
}
