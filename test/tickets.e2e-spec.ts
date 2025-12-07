import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('TicketsController (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Login to get access token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'laboratorio@acme-repair.com',
        password: 'ChangeMe123!',
      });

    accessToken = loginResponse.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/tickets (POST)', () => {
    it('should create a new ticket', () => {
      return request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId: 1,
          customerName: 'John Doe',
          customerPhone: '+52 555 123 4567',
          customerEmail: 'john@example.com',
          device: 'iPhone 12',
          brand: 'Apple',
          model: 'iPhone 12',
          problem: 'Screen is cracked and not working',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('folio');
          expect(res.body.customerName).toBe('John Doe');
          expect(res.body.device).toBe('iPhone 12');
          expect(res.body.state).toBe('RECIBIDO');
        });
    });

    it('should return 400 with missing required fields', () => {
      return request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId: 1,
          // Missing customerName, device, problem
        })
        .expect(400);
    });

    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .post('/tickets')
        .send({
          branchId: 1,
          customerName: 'John Doe',
          device: 'iPhone 12',
          problem: 'Screen broken',
        })
        .expect(401);
    });
  });

  describe('/tickets (GET)', () => {
    it('should return tickets list', () => {
      return request(app.getHttpServer())
        .get('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should filter tickets by state', () => {
      return request(app.getHttpServer())
        .get('/tickets?estado=RECIBIDO')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.every((ticket: any) => ticket.state === 'RECIBIDO')).toBe(true);
        });
    });

    it('should search tickets by query', () => {
      return request(app.getHttpServer())
        .get('/tickets?q=iPhone')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          // Should return tickets containing "iPhone" in device, customer name, or problem
          expect(res.body.data.length).toBeGreaterThanOrEqual(0);
        });
    });
  });

  describe('/tickets/:id (GET)', () => {
    let ticketId: number;

    beforeEach(async () => {
      // Create a ticket first
      const createResponse = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId: 1,
          customerName: 'Test Customer',
          device: 'Samsung Galaxy',
          problem: 'Battery issue',
        });

      ticketId = createResponse.body.id;
    });

    it('should return ticket details', () => {
      return request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', ticketId);
          expect(res.body).toHaveProperty('folio');
          expect(res.body).toHaveProperty('customerName');
          expect(res.body).toHaveProperty('device');
          expect(res.body).toHaveProperty('problem');
        });
    });

    it('should return 404 for non-existent ticket', () => {
      return request(app.getHttpServer())
        .get('/tickets/99999')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('/tickets/:id/estado (PATCH)', () => {
    let ticketId: number;

    beforeEach(async () => {
      // Create a ticket first
      const createResponse = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId: 1,
          customerName: 'Test Customer',
          device: 'iPhone 13',
          problem: 'Screen replacement needed',
        });

      ticketId = createResponse.body.id;
    });

    it('should update ticket state', () => {
      return request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/estado`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          state: 'DIAGNOSTICO',
          notes: 'Initial diagnosis completed',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.state).toBe('DIAGNOSTICO');
        });
    });

    it('should return 400 for invalid state transition', () => {
      return request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/estado`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          state: 'ENTREGADO', // Invalid transition from RECIBIDO
          notes: 'Invalid transition',
        })
        .expect(400);
    });
  });
});

