const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv')
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(bodyParser.json());

// Middleware to check JWT
const authenticateJWT = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (token) {
    jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// User registration
app.post('/auth/register',
    [
        body('email').isEmail().withMessage('Invalid email address')
          .isLength({ max: 100 }).withMessage('Email must be at most 100 characters')
          .custom(async (email) => {
            const user = await prisma.user.findUnique({ where: { email } });
            if (user) {
              return Promise.reject('Email already in use');
            }
          }),
        body('firstName').isLength({ min: 1, max: 50 }).withMessage('First name must be between 1 and 50 characters'),
        body('lastName').isLength({ min: 1, max: 50 }).withMessage('Last name must be between 1 and 50 characters'),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    ], 
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
                const simplifiedErrors = errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }));
            return res.status(422).json({ errors: simplifiedErrors });
        }

        const { firstName, lastName, email, password, phone } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        try {
            const organisation = await prisma.organisation.create({
            data: { name: firstName + "'s organisation" }
            });

            const user = await prisma.user.create({
                data: {
                    email,
                    firstName,
                    lastName,
                    phone,
                    password: hashedPassword,
                    organisations: {
                    create: { organisationId: organisation.orgId }
                    }
                }
            });

            const token = jwt.sign({ userId: user.userId, email: user.email }, process.env.SECRET_KEY, { expiresIn: '1h' });
            res.status(201).json({ status: 'success', message: 'Registration successful', data : {accessToken : token , 
                user: {
                    userId: user.userId,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    phone: user.phone
                }
             }});

        } catch (error) {
            console.error(error);
            res.status(400).json({ status: 'Bad request', message: 'Registration unsuccessful', statusCode: 400 });
        }
    }
);

// User login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign({ userId: user.id, email: user.email }, process.env.SECRET_KEY, { expiresIn: '1h' });
      res.status(200).json({ status: 'success', message: 'Login successful', data : {accessToken : token , 
                user: {
                    userId: user.userId,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    phone: user.phone
                }
             }});

    } else {
      res.status(401).json({ status: 'Bad request', message: 'Authentication faied', statusCode: 401 });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Get current user record
app.get('/api/users/:id', authenticateJWT, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  try {
    const user = await prisma.user.findUnique({
      where: { userId },
      include: { organisations: { include: { organisation: true } } }
    });
    res.status(200).json({ status: 'success',message: 'user record', data : { 
            userId: user.userId,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone
        }});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

//get all organisations the user belongs to
app.get('/api/organisations', authenticateJWT, async (req, res) => {
  const email = req.user.email;
  
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        organisations: {
          include: { organisation: true }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Organisations user belongs to.',
      data: {
        organisations: user.organisations.map(org => ({
          orgId: org.organisation.orgId,
          name: org.organisation.name,
          description: org.organisation.description,
        }))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Get a single organisation the user belongs to
app.get('/api/organisations/:orgId', authenticateJWT, async (req, res) => {
  const email = req.user.email;
  const orgId = parseInt(req.params.orgId, 10);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        organisations: {
          include: { organisation: true }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const organisation = user.organisations.find(org => org.organisation.orgId === orgId);

    if (!organisation) {
      return res.status(404).json({ message: 'User does not belong to this organisation' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Organisation user belongs to.',
      data: {
        orgId: organisation.organisation.orgId,
        name: organisation.organisation.name,
        description: organisation.organisation.description,
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' });
  }
});

//user can create their own organisation
app.post('/api/organisations',
    [
        body('name').isLength({ min: 1, max: 20 }).withMessage('Name must be between 1 and 20 characters'),
        body('description').isLength({ min: 1, max: 100 }).withMessage('Last name must be between 1 and 100 characters')
    ],
    authenticateJWT, async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
                const simplifiedErrors = errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }));
            return res.status(422).json({ errors: simplifiedErrors });
        }

        const { name, description } = req.body;
        const email = req.user.email;
        try {
            const user = await prisma.user.findUnique({
                where: { email }
            });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            const organisation = await prisma.organisation.create({
                data: { name, description, users: {
                    create: {
                        uId: user.userId
                    }}
                }
            });
            if (!organisation) {
                return res.status(400).json({ status: 'Bad Request', message: 'Client error', statusCode: 400 });
            }

            res.status(200).json({
                status: 'success',
                message: 'Organisation created successfully',
                data: {
                    orgId: organisation.orgId,
                    name: organisation.name,
                    description: organisation.description,
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Something went wrong' });
        }
});

//add a user to a particular organisation
app.post('/api/organisations/:orgId/users', async (req, res) => {
    const { userId } = req.body;
    const orgId = parseInt(req.params.orgId, 10);

    try {
      const organisation = await prisma.organisation.findUnique({
        where: { orgId }
      });

      if (!organisation) {
        return res.status(404).json({ message: 'Organisation not found' });
      }

      const user = await prisma.user.findUnique({
        where: { userId }
      });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const userOrganisation = await prisma.userOrganisation.create({
        data: {
          uId: userId,
          organisationId: orgId
        }
      });

      res.status(200).json({
        status: 'success',
        message: 'User added to the organisation successfully',
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Something went wrong' });
    }
  }
);

 app.listen(3000, () => {
   console.log('Server started on http://localhost:3000');
 });


module.exports = app;