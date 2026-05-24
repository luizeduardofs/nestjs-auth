import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthController } from "./auth/auth.controller";
import { UsersModule } from "./users/users.module";

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			expandVariables: true,
		}),
		UsersModule,
	],
	controllers: [AuthController],
	providers: [],
})
export class AppModule {}
