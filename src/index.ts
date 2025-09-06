
import { Elysia } from 'elysia';
import { home } from './routes/home';

const app = new Elysia();

app.get('/', () => 'Hello from Otakuin API!');
app.group('/api', (app) => app.use(home));


app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
