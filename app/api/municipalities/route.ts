import registry from '../../../data/municipalities.json';
export async function GET(){return Response.json(registry,{headers:{'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}})}
