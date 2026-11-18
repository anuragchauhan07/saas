import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateOrgDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}

export class InviteDto {
  @IsEmail()
  email: string;

  @IsIn(['admin', 'member'])
  role: 'admin' | 'member';
}

export class AcceptInviteDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}