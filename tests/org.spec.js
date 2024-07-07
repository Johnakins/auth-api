const request = require('supertest');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv')

dotenv.config();
const app = require('../index'); // Adjust the path according to your project structure

const prisma = new PrismaClient();

jest.setTimeout(30000); 

describe('Organisation access', () => {
  let user1, user2, organisation;

  beforeAll(async () => {
    // Create test users and organisation
    user1 = await prisma.user.create({
      data: {
        email: 'user1@example.com',
        firstName: 'User',
        lastName: 'One',
        password: 'hashedpassword1',
        phone: '1234567890'
      },
    });

    user2 = await prisma.user.create({
      data: {
        email: 'user2@example.com',
        firstName: 'User',
        lastName: 'Two',
        password: 'hashedpassword2',
        phone: '12345678'
      },
    });

    organisation = await prisma.organisation.create({
      data: {
        name: 'Test Organisation',
        description: 'This is a test organisation',
        users: {
          create: {
            uId: user1.userId,
          },
        },
      },
    });
  }, 30000);

  afterAll(async () => {
    // Clean up test data
    await prisma.userOrganisation.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.organisation.deleteMany({});
  }, 30000);

  it('should not allow user2 to see organisations they do not have access to', async () => {
    const token = jwt.sign({ userId: user2.userId, email: user2.email }, process.env.SECRET_KEY, { expiresIn: '1h' });

    const res = await request(app)
      .get(`/api/organisations/${organisation.orgId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('message', 'User does not belong to this organisation');
  });
}, 30000);
