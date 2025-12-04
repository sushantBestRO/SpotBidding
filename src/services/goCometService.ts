import axios from 'axios';
import { config } from '../config';

export const getHeaders = (authToken: string) => {
    return {
        'accept': 'application/json',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'en-US,en;q=0.9',
        'authorization': authToken || '',
        'cache-control': 'no-cache',
        'ops-client-schema': 'app',
        'origin': 'https://app.gocomet.com',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'referer': 'https://app.gocomet.com/',
        'schema': 'app',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    };
};

export const goCometApi = axios.create({
    baseURL: config.apiBaseUrl,
});

// Add logging interceptors
goCometApi.interceptors.request.use(request => {
    console.log(`[GoComet API] Request: ${request.method?.toUpperCase()} ${request.url}`);
    return request;
});

goCometApi.interceptors.response.use(
    response => {
        console.log(`[GoComet API] Response: ${response.status} ${response.config.url}`);
        return response;
    },
    error => {
        console.error(`[GoComet API] Error: ${error.message} for ${error.config?.url}`);
        return Promise.reject(error);
    }
);
