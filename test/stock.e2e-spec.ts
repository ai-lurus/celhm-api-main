import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('StockController (e2e)', () => {
  let app: INestApplication;
  let tecnicoAccessToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // laboratorio@acme-repair.com is seeded with Role.TECNICO
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'laboratorio@acme-repair.com',
        password: 'ChangeMe123!',
      });

    tecnicoAccessToken = loginResponse.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/stock (GET)', () => {
    it('allows a TECNICO to search stock when assigning parts to a ticket', () => {
      return request(app.getHttpServer())
        .get('/stock')
        .set('Authorization', `Bearer ${tecnicoAccessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });
  });
});
