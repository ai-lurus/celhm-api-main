import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './src/app.module';
import { JwtAuthGuard } from './src/common/guards/jwt-auth.guard';

async function bootstrap() {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
  .overrideGuard(JwtAuthGuard)
  .useValue({
    canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      req.user = { id: 1, organizationId: 1 };
      return true;
    }
  })
  .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();

  console.log("Testing GET /cash/cuts...");
  const res1 = await request(app.getHttpServer()).get('/cash/cuts?branchId=1&page=1&pageSize=20');
  console.log("GET /cash/cuts STATUS:", res1.status);
  console.log("GET /cash/cuts BODY:", res1.text);

  console.log("Testing POST /cash/registers...");
  const res2 = await request(app.getHttpServer()).post('/cash/registers').send({ branchId: 1, name: "Test Register" });
  console.log("POST /cash/registers STATUS:", res2.status);
  console.log("POST /cash/registers BODY:", res2.text);

  await app.close();
}
bootstrap();
