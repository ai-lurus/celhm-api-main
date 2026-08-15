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

  describe('/stock/items (POST)', () => {
    let adminAccessToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'direccion@acme-repair.com', password: 'ChangeMe123!' });
      adminAccessToken = loginResponse.body.access_token;
    });

    it('auto-generates a mask-based sku when none is provided', async () => {
      const categoriesResponse = await request(app.getHttpServer())
        .get('/catalog/categories')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      // Get a valid category ID - use first top-level category or first child
      let categoryId: number;
      if (Array.isArray(categoriesResponse.body) && categoriesResponse.body.length > 0) {
        const firstCategory = categoriesResponse.body[0];
        if (firstCategory.children && firstCategory.children.length > 0) {
          categoryId = firstCategory.children[0].id;
        } else {
          categoryId = firstCategory.id;
        }
      } else {
        // Skip test if no categories exist
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/stock/items')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Producto E2E Sku Test',
          categoryId,
          qty: 1,
          min: 0,
        })
        .expect(201);

      expect(response.body.variant.sku).toBeTruthy();
      expect(response.body.variant.sku).not.toMatch(/^SKU-\d+/);
    });
  });
});
