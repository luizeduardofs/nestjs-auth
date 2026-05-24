import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class RegisterDto {
	@IsNotEmpty()
	@IsString()
	@ApiProperty({ example: "John Doe" })
	name!: string;

	@IsEmail()
	@IsNotEmpty()
	@ApiProperty({ example: "john@mail.com" })
	email!: string;

	@IsString()
	@MinLength(8)
	@ApiProperty({ example: "Admin123@", minLength: 8 })
	password!: string;
}
