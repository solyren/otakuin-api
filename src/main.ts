import 'dotenv/config';
import { app } from './index';
import { updateHome } from './cron/update_home';
import { updateTop10 } from './cron/update_top10';

// --- Main ---
const main = async () => {
    await Promise.all([
        updateHome(),
        updateTop10()
    ]);

    setInterval(updateHome, 30 * 60 * 1000);
    setInterval(updateTop10, 7 * 24 * 60 * 60 * 1000);

    app.listen(3000, () => {
        console.log('Server is running on http://localhost:3000');
    });
}

main();