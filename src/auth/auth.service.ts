import * as crypto from "node:crypto";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import type { Response } from "express";
import type { User } from "../db/schema";
import type { UsersService } from "../users/users.service";
import type { LoginDto } from "./dtos/login.dto";
import type { RegisterDto } from "./dtos/register.dto";
import type { EmailService } from "./email.service";

@Injectable()
export class AuthService {
	constructor(
		private readonly usersService: UsersService,
		private readonly jwtService: JwtService,
		private readonly configService: ConfigService,
		private readonly emailService: EmailService,
	) {}

	async register(dto: RegisterDto) {
		const existingUser = await this.usersService.findByEmail(dto.email);

		if (existingUser)
			throw new ConflictException("An account with this email already exists");

		const passwordHash = await bcrypt.hash(dto.password, 12);
		const verificationToken = crypto.randomBytes(32).toString("hex");
		const verificationTokenExpiresAt = new Date(
			Date.now() + 24 * 60 * 60 * 1000, // 24 hours
		);

		const user = await this.usersService.create({
			email: dto.email,
			name: dto.name,
			passwordHash,
			verificationToken,
			verificationTokenExpiresAt,
		});

		void this.emailService.sendVerificationEmail(user.email, verificationToken);

		return {
			message:
				"Registration Successfully! Please check your email to verify your account",
		};
	}

	async login(dto: LoginDto, res: Response) {
		const user = await this.usersService.findByEmail(dto.email);
		const UNAUTHORIZED_MESSAGE: string = "Invalid email or password";

		if (!user) throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);

		const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);

		if (!passwordMatch) throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);

		if (!user.isVerified)
			throw new UnauthorizedException(
				"Please verify your email before logging in",
			);

		const token = await this.generateToken(user);
		await this.saveRefreshToken(user.id, token.refreshToken);
		this.setRefreshTokenCookie(res, token.refreshToken);

		return {
			access_token: token.accessToken,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
			},
		};
	}

	private async generateToken(user: User) {}
}
