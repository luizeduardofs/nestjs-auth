import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class LoginDto {
	@IsEmail()
	@IsNotEmpty()
	@ApiProperty({ example: "john@mail.com" })
	email!: string;

	@IsString()
	@IsNotEmpty()
	@ApiProperty({ example: "Admin123@" })
	password!: string;
}
