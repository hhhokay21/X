const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// قاعدة بيانات وهمية للمستخدمين
let users = {
    "yameen": {
        username: "yameen",
        email: "elsamirandari@gmail.com",
        password: "123",
        balance: 0.0002588852,
        hashRate: 100, // H/s
        referralCode: "F284B08B",
        referralsCount: 2,
        lastUpdate: Date.now(),
        lastWithdrawTime: 0,
        isBanned: false
    }
};

// تحديث الأرباح تلقائياً في الخلفية
setInterval(() => {
    const now = Date.now();
    for (let username in users) {
        let user = users[username];
        if (user.isBanned) continue;
        let secondsPassed = (now - user.lastUpdate) / 1000;
        let earningPerSecond = (user.hashRate * (0.0005 / 86400)); 
        user.balance += earningPerSecond * secondsPassed;
        user.lastUpdate = now;
    }
}, 1000);

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (users[username] && users[username].password === password) {
        let user = users[username];
        if (user.isBanned) {
            return res.status(403).json({ success: false, message: "This account has been banned." });
        }
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, message: "Invalid username or password" });
    }
});

// إنشاء حساب جديد
app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    if (users[username]) {
        return res.status(400).json({ success: false, message: "Username already exists" });
    }
    users[username] = {
        username,
        email,
        password,
        balance: 0,
        hashRate: 100,
        referralCode: 'F' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        referralsCount: 0,
        lastUpdate: Date.now(),
        lastWithdrawTime: 0,
        isBanned: false
    };
    res.json({ success: true, user: users[username] });
});

// جلب بيانات المستخدم
app.get('/api/user/:username', (req, res) => {
    const username = req.params.username;
    if (users[username]) {
        let user = users[username];
        if (user.isBanned) {
            return res.status(403).json({ success: false, message: "User is banned" });
        }

        let now = Date.now();
        let cooldownTime = 60 * 60 * 1000;
        let timePassed = now - user.lastWithdrawTime;
        let timeLeft = 0;

        if (timePassed < cooldownTime) {
            timeLeft = Math.ceil((cooldownTime - timePassed) / 1000);
        }

        res.json({ 
            success: true, 
            user: {
                username: user.username,
                email: user.email,
                balance: user.balance,
                hashRate: user.hashRate,
                referralCode: user.referralCode,
                referralsCount: user.referralsCount,
                timeLeft: timeLeft
            }
        });
    } else {
        res.status(404).json({ success: false, message: "User not found" });
    }
});

// تنفيذ السحب
app.post('/api/withdraw', (req, res) => {
    const { username, amount } = req.body;
    let user = users[username];
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.isBanned) return res.status(403).json({ success: false, message: "User is banned" });

    let now = Date.now();
    let cooldownTime = 60 * 60 * 1000;

    if (now - user.lastWithdrawTime < cooldownTime) {
        let remainingSeconds = Math.ceil((cooldownTime - (now - user.lastWithdrawTime)) / 1000);
        return res.status(400).json({ success: false, message: "Please wait before withdrawing again.", timeLeft: remainingSeconds });
    }

    const minWithdraw = 0.0001;
    if (user.balance < minWithdraw) {
        return res.status(400).json({ success: false, message: "Minimum withdrawal: 0.0001 USDT" });
    }

    let withdrawAmount = amount && amount <= user.balance ? amount : user.balance;
    user.balance -= withdrawAmount;
    user.lastWithdrawTime = now;

    res.json({ success: true, message: "Withdrawal successful!", withdrawn: withdrawAmount, timeLeft: 3600 });
});

// إنشاء طلب دفع عبر FaucetPay
app.post('/api/create-payment', (req, res) => {
    const { username, addedHash, amountUSD } = req.body;
    let user = users[username];
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const merchantUsername = 'YOUR_FAUCETPAY_MERCHANT_USERNAME'; 
    const currency = 'USDT';
    const callbackUrl = `http://localhost:3000/api/faucetpay-ipn`;
    const customData = `${username}_${addedHash}`;

    const paymentUrl = `https://faucetpay.io/merchant/web/index?merchant_username=${encodeURIComponent(merchantUsername)}&amount=${amountUSD}&currency=${currency}&custom=${encodeURIComponent(customData)}&callback_url=${encodeURIComponent(callbackUrl)}`;

    res.json({ success: true, paymentUrl });
});

// استقبال الـ IPN لتأكيد الدفع وإضافة الهاش
app.post('/api/faucetpay-ipn', (req, res) => {
    const ipnData = req.body;
    if (ipnData && (ipnData.status === 'paid' || ipnData.status === 200)) {
        const customField = ipnData.custom; 
        if (customField) {
            const [username, addedHash] = customField.split('_');
            let user = users[username];
            if (user && addedHash) {
                user.hashRate += Number(addedHash);
                return res.status(200).send('IPN Processed Successfully');
            }
        }
    }
    res.status(400).send('Invalid IPN Data');
});

app.use(express.static(path.join(__dirname)));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});