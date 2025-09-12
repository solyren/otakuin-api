
import 'dotenv/config';
import { app } from './index';
import { updateHome } from './cron/update_home';

const main = async () => {
    await updateHome();
    setInterval(updateHome, 5 * 60 * 1000);

    app.listen(3000, () => {
        console.log('Server is running on http://localhost:3000');
    });
}

main();
