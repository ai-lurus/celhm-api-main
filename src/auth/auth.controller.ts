import { Controller, Post, Body, Get, UseGuards, Request, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    // Log received data for debugging
    console.log('📥 Login request received:', {
      email: loginDto.email,
      passwordLength: loginDto.password?.length,
      passwordFirstChars: loginDto.password?.substring(0, 10),
      passwordLastChars: loginDto.password?.substring(Math.max(0, (loginDto.password?.length || 0) - 10)),
    });
    
    const user = await this.authService.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      console.log('❌ Login failed for:', loginDto.email);
      throw new UnauthorizedException('Invalid credentials');
    }
    console.log('✅ Login successful for:', loginDto.email);
    return this.authService.login(user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({ status: 200, description: 'Current user data' })
  async getCurrentUser(@Request() req) {
    return req.user;
  }
}
