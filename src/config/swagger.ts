import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Spot Bidding API',
            version: '1.0.0',
            description: 'API documentation for the Spot Bidding Application\n\nDeveloped by **Tirnav Solutions Private Limited** for **Best Roadways Limited**',
            contact: {
                name: 'Tirnav Solutions Private Limited',
                url: 'https://tirnav.com',
            },
        },
        servers: [
            {
                url: `http://localhost:${config.port}`,
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'connect.sid',
                },
            },
        },
        security: [
            {
                cookieAuth: [],
            },
        ],
    },
    apis: ['./src/routes/*.ts'], // Path to the API docs
};

export const specs = swaggerJsdoc(options);
