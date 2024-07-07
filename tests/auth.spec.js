const request = require('supertest');
const app = require('../index');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv')

dotenv.config();

const prisma = new PrismaClient();

beforeAll(async () => {
  // Ensure clean state before running tests
  await prisma.userOrganisation.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  // Clean up and close the database connection after tests
  await prisma.$disconnect();
});

describe('User Registration and Login', () => {
  const userData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'johndoe@example.com',
    password: 'password123',
    phone: '1234567890'
  };

  test('It Should Register User Successfully with Default Organisation and Log in', async () => {
    // Step 1: Register the user
    const registerResponse = await request(app)
      .post('/auth/register')
      .send(userData);

    expect(registerResponse.statusCode).toBe(201);
    expect(registerResponse.body.status).toBe('success');
    expect(registerResponse.body.data).toHaveProperty('accessToken');
    expect(registerResponse.body.data.user.firstName).toBe('John');
    expect(registerResponse.body.data.user.lastName).toBe('Doe');
    expect(registerResponse.body.data.user.email).toBe('johndoe@example.com');

    // Step 2: Verify the user and organisation creation
    const user = await prisma.user.findUnique({
      where: { email: 'johndoe@example.com' },
      include: {
        organisations: {
          include: {
            organisation: true
          }
        }
      }
    });

    expect(user).toBeDefined();
    expect(user.organisations[0]).toBeDefined();
    expect(user.organisations[0].organisation.name).toBe("John's organisation");

    // Step 3: Log in the user
    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email: 'johndoe@example.com',
        password: 'password123'
      });

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.body.status).toBe('success');
    expect(loginResponse.body.data).toHaveProperty('accessToken');
    expect(loginResponse.body.data.user.email).toBe('johndoe@example.com');

    const token = loginResponse.body.data.accessToken;
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    expect(decoded).toHaveProperty('email', user.email);
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  }, 30000); // Extend timeout to 30 seconds

   test('It Should Fail if there’s Duplicate Email', async () => {
    // Attempt to register the same user again
    const response = await request(app)
      .post('/auth/register')
      .send(userData);

    expect(response.statusCode).toBe(422);
    expect(response.body.errors).toContainEqual({
      field: 'email',
      message: 'Email already in use'
    });
  }, 30000);
});

  test('It Should Fail If Required Fields Are Missing', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({
        email: 'missingfields@example.com',
        password: 'password123'
      });

    expect(response.statusCode).toBe(422);
    expect(response.body.errors).toContainEqual({
      field: 'firstName',
      message: 'First name must be between 1 and 50 characters'
    });
    expect(response.body.errors).toContainEqual({
      field: 'lastName',
      message: 'Last name must be between 1 and 50 characters'
    });
  }, 30000); // Set timeout to 10 seconds for this test

 