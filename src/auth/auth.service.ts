import * as crypto from "node:crypto";
import {
	BadRequestException,
	ConflictException,
	Injectable,
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

	async verifyEmail(token: string, res: Response) {
		const user = await this.usersService.findByVerificationToken(token);

		if (!user?.verificationToken)
			throw new BadRequestException("Invalid verification token");

		if (
			user.verificationTokenExpiresAt &&
			user.verificationTokenExpiresAt < new Date()
		)
			throw new BadRequestException(
				"verification token has expired. Please request anew one",
			);

		await this.usersService.update(user.id, {
			isVerified: true,
			verificationToken: null,
			verificationTokenExpiresAt: null,
		});

		const tokens = await this.generateToken(user);
		await this.saveRefreshToken(user.id, tokens.refreshToken);
		this.setRefreshTokenCookie(res, tokens.refreshToken);

		return {
			message: "Email verified successfully, you are now logged in",
			access_token: tokens.accessToken,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
			},
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

	async refresh(refreshToken: string, res: Response) {
		if (!refreshToken)
			throw new UnauthorizedException("No refresh token provided");

		let payload: { sub: string; email: string };

		try {
			payload = await this.jwtService.verifyAsync(refreshToken, {
				secret: this.configService.get("JWT_REFRESH_SECRET"),
			});
		} catch {
			throw new UnauthorizedException("Invalid or expired refresh token");
		}

		const user = await this.usersService.findById(payload.sub);

		if (!user?.refreshTokenHash)
			throw new UnauthorizedException("Invalid refresh token");

		const tokenMatch = await bcrypt.compare(
			refreshToken,
			user.refreshTokenHash,
		);

		if (!tokenMatch) throw new UnauthorizedException("Invalid refresh token");

		const token = await this.generateToken(user);
		await this.saveRefreshToken(user.id, token.refreshToken);
		this.setRefreshTokenCookie(res, token.refreshToken);

		return {
			access_token: token.accessToken,
		};
	}

	async logout(userId: string, res: Response) {
		await this.usersService.update(userId, { refreshTokenHash: null });
		res.clearCookie("refresh_token");

		return {
			message: "Logged out successfully",
		};
	}

	private async generateToken(user: User) {
		const payload = { sub: user.id, email: user.email, role: user.role };

		const accessToken = await this.jwtService.signAsync(payload, {
			secret: this.configService.get("JWT_ACCESS_SECRET"),
			expiresIn: this.configService.get("JWT_ACCESS_EXPIRES_IN"),
		});

		const refreshToken = await this.jwtService.signAsync(payload, {
			secret: this.configService.get("JWT_REFRESH_SECRET"),
			expiresIn: this.configService.get("JWT_REFRESH_EXPIRES_IN"),
		});

		return {
			accessToken,
			refreshToken,
		};
	}

	private async saveRefreshToken(userId: string, refreshToken: string) {
		const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
		await this.usersService.update(userId, { refreshTokenHash });
	}

	private async setRefreshTokenCookie(res: Response, refreshToken: string) {
		res.cookie("refresh_token", refreshToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 7 * 24 * 60 * 60 * 1000,
		});
	}
}
