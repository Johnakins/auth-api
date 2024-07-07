const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const app = require('../index'); // Adjust the path according to your project structure
const dotenv = require('dotenv')

dotenv.config();

const prisma = new PrismaClient();
 // Replace with your actual secret key

describe('Token generation', () => {
  let user;

  beforeAll(async () => {
    // Hash the password before creating the user
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Create an organisation with a name based on the user's first name
    const organisation = await prisma.organisation.create({
        data: { 
            name: 'Test\'s organisation' 
        }
    });

    // Create a test user and associate them with the organisation
    user = await prisma.user.create({
        data: {
            email: 'testuser@example.com',
            firstName: 'Test',
            lastName: 'User',
            password: hashedPassword, // Use the hashed password
            phone: '1234567890',
            organisations: {
                create: { 
                    organisationId: organisation.orgId 
                }
            }
        },
    });
});

  afterAll(async () => {
    // Clean up test data
    await prisma.userOrganisation.deleteMany();
    await prisma.organisation.deleteMany();
    await prisma.user.deleteMany();
  });

  it('should generate a token with correct expiration and user details', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'password123' }); 

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('accessToken');

    const token = res.body.data.accessToken;
    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    // expect(decoded).toHaveProperty('userId', user.userId);
    expect(decoded).toHaveProperty('email', user.email);
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
