import { db } from '../config/db';
import { users, systemConfig } from '../models/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

const seedUsers = async () => {
    const usersToSeed = [
        {
            username: 'bestroadways',
            password: 'sg@1234',
            name: 'Best Roadways',
            role: 'admin' as const,
            isAdmin: true
        },
        {
            username: 'admin',
            password: 'sg@bestroadways',
            name: 'Administrator',
            role: 'admin' as const,
            isAdmin: true
        }
    ];

    console.log('Seeding users...');

    for (const userData of usersToSeed) {
        const existingUser = await db.select().from(users).where(eq(users.username, userData.username));

        if (existingUser.length === 0) {
            const hashedPassword = await bcrypt.hash(userData.password, 10);
            await db.insert(users).values({
                username: userData.username,
                password: hashedPassword,
                name: userData.name,
                role: userData.role,
                isAdmin: userData.isAdmin,
                isActive: true
            });
            console.log(`User ${userData.username} created.`);
        } else {
            // Update password if user exists
            const hashedPassword = await bcrypt.hash(userData.password, 10);
            await db.update(users)
                .set({
                    password: hashedPassword,
                    role: userData.role,
                    isAdmin: userData.isAdmin
                })
                .where(eq(users.username, userData.username));
            console.log(`User ${userData.username} updated.`);
        }
    }

    console.log('Seeding system configuration...');

    const defaultConfig = {
        emailConfig: {
            senderEmail: "suyashh.gupta@gmail.com",
            senderPassword: "cghezniyeyybbqxb",
            recipientEmail: "sg@bestroadways.com",
            dailyReportTime: "21:01",
            enableDailyReports: false
        },
        whatsappConfig: {
            apiKey: "key_18pgKxjX6M",
            senderNumber: "+912242777777",
            templateName: "hello_world",
            enableWhatsApp: false
        },
        pricePercents: {
            low: 5,
            high: 9,
            medium: 7
        },
        locations: [
            {
                id: "chikhli",
                sourceLocation: "Survey No. 1934, NH-48, Near Darshan Hotel, Village # Degam, Taluka # Chikhli, Degam-396530, Gujarat",
                plantName: "Chikhli Plant",
                concernedPerson: "Ravinder Sharma",
                mobile: "+91 95949 64681",
                email: "vapi@bestroadways.com",
                firstMessage: "Dear Ravinder, \nA new inquiry (OA No. <>)has come.\nEnquiry Date and Time- \nBid Closing Date and Time - \nLoading from - Chikhli Plant\nDelivery to - <Delivery Address>\nType of Vehicle - <>\nQuantity of Vehicle - <>\nEnter your best and lowest market rate by clicking on this link and help us win this indent.",
                winMessage: "Dear Ravinder, we have won the order against OA No <>\nFrom -  <Loading Address>\nTo - <Unloading Address>\nMarket Rate given by you- <>\nOur added margin - <%>\nFinal Rate - <Rs>\nNo of Vehicles - <>\nTalk to the Plant Manager and arrange for sending the vehicles accordingly on time.\nDelay Penalty Applicable Rs 1500 after 24 hours.",
                loseMessage: "Dear Ravinder, we have lost the order against OA No <>\nFrom -  <Loading Address>\nTo - <Unloading Address>\nMarket Rate given by you- <>\nOur added margin - <%>\nNo of Submissions- \nFinal Rate - <Rs>\nOur Final Ranking - \nNo of Vehicles - <>\nPlease check why the rate given by you was so high and make sure that you give more competitive rates from next time."
            },
            {
                id: "tumb",
                sourceLocation: "Survey No. 38/1,Village-Tumb, Taluka- Umbergaon, Tumb-396150, Gujarat",
                plantName: "Tumb Plant",
                concernedPerson: "Ravinder Sharma",
                mobile: "+91 95949 64681",
                email: "vapi@bestroadways.com",
                firstMessage: "Dear Ravinder, \nA new inquiry (OA No. <>)has come.\nEnquiry Date and Time- \nBid Closing Date and Time - \nLoading from - Tumb Plant\nDelivery to - <Delivery Address>\nType of Vehicle - <>\nQuantity of Vehicle - <>\nEnter your best and lowest market rate by clicking on this link and help us win this indent.",
                winMessage: "Dear Ravinder, we have won the order against OA No <>\nFrom -  <Loading Address>\nTo - <Unloading Address>\nMarket Rate given by you- <>\nOur added margin - <%>\nFinal Rate - <Rs>\nNo of Vehicles - <>\nTalk to the Plant Manager and arrange for sending the vehicles accordingly on time.\nDelay Penalty Applicable Rs 1500 after 24 hours.",
                loseMessage: "Dear Ravinder, we have lost the order against OA No <>\nFrom -  <Loading Address>\nTo - <Unloading Address>\nMarket Rate given by you- <>\nOur added margin - <%>\nNo of Submissions- \nFinal Rate - <Rs>\nOur Final Ranking - \nNo of Vehicles - <>\nPlease check why the rate given by you was so high and make sure that you give more competitive rates from next time."
            },
            {
                id: "noida",
                sourceLocation: "3C/1, Ecotech 2, Udyog Vihar Road, Gautam Buddha Nagar, Udyog Vihar, Greater Noida-201306, Uttar Pradesh",
                plantName: "Noida Plant",
                concernedPerson: "Sushil Poonia",
                mobile: "+91 78383 23217",
                email: "noida@bestroadways.com",
                firstMessage: "Dear Sushil, \nA new inquiry (OA No. <>)has come.\nEnquiry Date and Time- \nBid Closing Date and Time - \nLoading from - Noida Plant\nDelivery to - <Delivery Address>\nType of Vehicle - <>\nQuantity of Vehicle - <>\nEnter your best and lowest market rate by clicking on this link and help us win this indent.",
                winMessage: "Dear Sushil, we have won the order against OA No <>\nFrom -  <Loading Address>\nTo - <Unloading Address>\nMarket Rate given by you- <>\nOur added margin - <%>\nFinal Rate - <Rs>\nNo of Vehicles - <>\nTalk to the Plant Manager and arrange for sending the vehicles accordingly on time.\nDelay Penalty Applicable Rs 1500 after 24 hours.",
                loseMessage: "Dear Sushil, we have lost the order against OA No <>\nFrom -  <Loading Address>\nTo - <Unloading Address>\nMarket Rate given by you- <>\nOur added margin - <%>\nNo of Submissions- \nFinal Rate - <Rs>\nOur Final Ranking - \nNo of Vehicles - <>\nPlease check why the rate given by you was so high and make sure that you give more competitive rates from next time."
            },
            {
                id: "nandigram",
                sourceLocation: "Unit 2B, Survey no. 267, NH-8, Nr Reliance Petrol Pump, Nandigram,-396105, Gujarat",
                plantName: "Nandigram Plant",
                concernedPerson: "Ravinder Sharma",
                mobile: "+91 95949 64681",
                email: "vapi@bestroadways.com",
                firstMessage: "Dear Ravinder, \nA new inquiry (OA No. <>)has come.\nEnquiry Date and Time- \nBid Closing Date and Time - \nLoading from - Nandigram Plant\nDelivery to - <Delivery Address>\nType of Vehicle - <>\nQuantity of Vehicle - <>\nEnter your best and lowest market rate by clicking on this link and help us win this indent.",
                winMessage: "Dear Ravinder, we have won the order against OA No <>\nFrom -  <Loading Address>\nTo - <Unloading Address>\nMarket Rate given by you- <>\nOur added margin - <%>\nFinal Rate - <Rs>\nNo of Vehicles - <>\nTalk to the Plant Manager and arrange for sending the vehicles accordingly on time.\nDelay Penalty Applicable Rs 1500 after 24 hours.",
                loseMessage: "Dear Ravinder, we have lost the order against OA No <>\nFrom -  <Loading Address>\nTo - <Unloading Address>\nMarket Rate given by you- <>\nOur added margin - <%>\nNo of Submissions- \nFinal Rate - <Rs>\nOur Final Ranking - \nNo of Vehicles - <>\nPlease check why the rate given by you was so high and make sure that you give more competitive rates from next time."
            }
        ]
    };

    // Check if config exists
    const existingConfig = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);

    if (existingConfig.length === 0) {
        await db.insert(systemConfig).values({
            id: 1,
            config: defaultConfig
        });
        console.log('System configuration created.');
    } else {
        // Merge existing config with new defaults, but prioritize new defaults for these specific sections
        const currentConfig = existingConfig[0].config as any || {};
        const updatedConfig = {
            ...currentConfig,
            emailConfig: { ...currentConfig.emailConfig, ...defaultConfig.emailConfig },
            whatsappConfig: { ...currentConfig.whatsappConfig, ...defaultConfig.whatsappConfig },
            locations: defaultConfig.locations // Overwrite locations to ensure they match the requested list
        };

        await db.update(systemConfig)
            .set({
                config: updatedConfig,
                updatedAt: new Date()
            })
            .where(eq(systemConfig.id, 1));
        console.log('System configuration updated.');
    }

    console.log('Seeding complete.');
    process.exit(0);
};

seedUsers().catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
});
