import { PartialType } from '@nestjs/swagger';
import { CreateDeviceModelDto } from './create-device-model.dto';

export class UpdateDeviceModelDto extends PartialType(CreateDeviceModelDto) {}
