import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import {
  AUTH_THROTTLE,
  CLIENT_TYPE_HEADER,
  ClientType,
  REFRESH_COOKIE_NAME,
} from '../../../common/constants/auth.constants';
import { AllowPasswordChangeRequired, CurrentUser, Public } from '../../../common/decorators';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser } from '../../../common/interfaces';
import { CsrfOriginGuard } from '../../../core/guards/csrf-origin.guard';
import {
  AuthSessionDto,
  AuthSessionResponseDto,
  AuthUserDto,
  AuthUserResponseDto,
  EmptyResponseDto,
} from '../dto/auth-response.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { RegisterGarageDto } from '../dto/register-garage.dto';
import { IRequestMeta } from '../interfaces/request-meta.interface';
import { AuthService, IAuthSession } from '../services/auth.service';
import {
  clearRefreshCookie,
  IRefreshCookieConfig,
  setRefreshCookie,
} from '../utils/auth-cookie.util';

const readCookie = (req: Request, name: string): string | undefined => {
  const value: unknown = new Map(Object.entries(req.cookies ?? {})).get(name);
  return typeof value === 'string' ? value : undefined;
};

const CLIENT_TYPE_DOC = {
  name: CLIENT_TYPE_HEADER,
  enum: ClientType,
  required: false,
  description:
    '`web` (default): refresh token in httpOnly cookie. `mobile`: refresh token in body.',
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly cookieConfig: IRefreshCookieConfig;

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.cookieConfig = {
      secure: config.get<boolean>('security.cookieSecure', true),
      domain: config.get<string | undefined>('security.cookieDomain'),
      path: `/${config.get<string>('apiPrefix', 'api/v1')}/auth`,
    };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader(CLIENT_TYPE_DOC)
  @ApiOperation({ summary: 'Register a garage and its admin account (UC-1)' })
  @ApiResponse({ status: 201, type: AuthSessionResponseDto })
  async register(
    @Body() dto: RegisterGarageDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IApiResponse<AuthSessionDto>> {
    const result = await this.authService.register(dto, this.meta(req));
    return ResponseHelper.success(
      result.message,
      this.deliver(req, res, result.data),
      HttpStatus.CREATED,
    );
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(CLIENT_TYPE_DOC)
  @ApiOperation({ summary: 'Staff login (UC-2)' })
  @ApiResponse({ status: 200, type: AuthSessionResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IApiResponse<AuthSessionDto>> {
    const result = await this.authService.login(dto, this.meta(req));
    return ResponseHelper.success(result.message, this.deliver(req, res, result.data));
  }

  @Public()
  @UseGuards(CsrfOriginGuard)
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ ...CLIENT_TYPE_DOC, required: true })
  @ApiOperation({ summary: 'Rotate the refresh token and get a new access token' })
  @ApiResponse({ status: 200, type: AuthSessionResponseDto })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IApiResponse<AuthSessionDto>> {
    const raw = this.isMobile(req) ? dto.refreshToken : readCookie(req, REFRESH_COOKIE_NAME);
    if (!raw) {
      throw new UnauthorizedException({
        message: 'translation.AUTH_ERROR.REFRESH_TOKEN_MISSING',
        errorCode: 'REFRESH_TOKEN_MISSING',
      });
    }
    try {
      const result = await this.authService.refresh(raw, this.meta(req));
      return ResponseHelper.success(result.message, this.deliver(req, res, result.data));
    } catch (error) {
      if (!this.isMobile(req)) clearRefreshCookie(res, this.cookieConfig);
      throw error;
    }
  }

  @Post('logout')
  @AllowPasswordChangeRequired()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End the current session' })
  @ApiResponse({ status: 200, type: EmptyResponseDto })
  async logout(
    @CurrentUser() user: IAuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IApiResponse<null>> {
    const result = await this.authService.logout(user);
    clearRefreshCookie(res, this.cookieConfig);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post('logout-all')
  @AllowPasswordChangeRequired()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End every session of the current user on all devices' })
  @ApiResponse({ status: 200, type: EmptyResponseDto })
  async logoutAll(
    @CurrentUser() user: IAuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IApiResponse<null>> {
    const result = await this.authService.logoutAll(user, this.meta(req));
    clearRefreshCookie(res, this.cookieConfig);
    return ResponseHelper.success(result.message, result.data);
  }

  @Get('me')
  @AllowPasswordChangeRequired()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user and garage' })
  @ApiResponse({ status: 200, type: AuthUserResponseDto })
  async me(@CurrentUser() user: IAuthUser): Promise<IApiResponse<AuthUserDto>> {
    const result = await this.authService.me(user);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post('change-password')
  @AllowPasswordChangeRequired()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiHeader(CLIENT_TYPE_DOC)
  @ApiOperation({ summary: 'Change password; revokes all other sessions' })
  @ApiResponse({ status: 200, type: AuthSessionResponseDto })
  async changePassword(
    @CurrentUser() user: IAuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IApiResponse<AuthSessionDto>> {
    const result = await this.authService.changePassword(user, dto, this.meta(req));
    return ResponseHelper.success(result.message, this.deliver(req, res, result.data));
  }

  /** Web → refresh token in httpOnly cookie only. Mobile → refresh token in the body. */
  private deliver(req: Request, res: Response, session: IAuthSession): AuthSessionDto {
    const { tokens, user } = session;
    const body: AuthSessionDto = {
      accessToken: tokens.accessToken,
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
      user,
    };
    if (this.isMobile(req)) return { ...body, refreshToken: tokens.refreshToken };
    setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt, this.cookieConfig);
    return body;
  }

  private isMobile(req: Request): boolean {
    return req.header(CLIENT_TYPE_HEADER) === ClientType.MOBILE;
  }

  private meta(req: Request): IRequestMeta {
    return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
  }
}
