require('dotenv').config();

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Firebase
const controller = require('../controller.js');

// Puppeteer
const puppeteerExtra = require('puppeteer-extra');
const pluginStealth = require('puppeteer-extra-plugin-stealth');

// require executablePath from puppeteer
const {executablePath} = require('puppeteer');

// For generating filenames for the screenshots
const crypto = require("crypto");

module.exports = {
    data: new SlashCommandBuilder()
		.setName('promo')
		.setDescription('Gera um anuncio com ping')
        .addStringOption(option => option // Makes it possible to receive the link with the slash command
                         .setName('link')
                         .setDescription('Link do bagulho')
                         .setRequired(true)),
	async execute(interaction) {
        console.log(`${interaction.user.username} used /promo`); // logging purposes
        
        // retrieving settings from the guild
        await interaction.deferReply({ ephemeral: true });
        const guildSettings = await controller.getSettings(interaction.guildId);
        
        const link = interaction.options.getString('link');
        
        const page = await loadPage(link);
        
        console.log(` > Generated ${page.url}`);
        
        if(page.error){
            await interaction.editReply({content: 'Ocorreu um erro do meu lado, verifica se o link está correto :c' });
        }else{
            
            await interaction.editReply({content: 'Tudo certo por aqui, em instantes envio o anúncio.' });

            var resposta = new EmbedBuilder()
                .setColor(0xe309a2)
                .setTitle(page.title || link)
                .setURL(link)
                .setImage(page.url)
                .setTimestamp()

            if(page.price){
                resposta.addFields(
                    { name: 'Preço', value: `**${page.currency} ${page.price}**`, inline: true },
                    { name: '** **', value: `Enviado por <@${interaction.user.id}> 💛`, inline: true },
                );
            }
            
            
            // sending the embed on the current channel
            let channel = interaction.channel; 
            
            if('defaultChannel' in guildSettings){
                // sending the embed on the predefined channel
                channel = interaction.guild.channels.cache.get(guildSettings.defaultChannel);
            }
            
            // sends the embed message
            await channel.send({ embeds: [resposta] }).catch(error => {
                console.error(error);
                interaction.editReply({content: `Ocorreu um erro ao enviar o embed, verifique se eu tenho permissão para enviar mensagens no canal <#${channel.id}>` });
            });
            
            // pings the role stored in firebase
            if('ping' in guildSettings){
                if(guildSettings.ping){
                    await channel.send(`<@&${guildSettings.pingRole}>`).catch(console.error);
                }
            }
        }
        
	},
};

// Uses puppeteer to access the link and generate a screenshot
async function loadPage(link) {
    
    // where to store the file
    const image_path = 'public/';
    
    // generates random name
    const image_name = crypto.randomBytes(8).toString('hex') + '.png';
    var html_content = '';
    
    const args = [
        '--disable-extensions-except=./extensions/idontcareaboutcookies/',
        '--load-extension=./extensions/idontcareaboutcookies/',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
        '--window-size=1280,960',
        '--use-gl=egl'
    ];

    puppeteerExtra.use(pluginStealth());
    
    //console.log('launches browser');
    const browser = await puppeteerExtra.launch({
        args: args,
        defaultViewport: {
            width: 1280,
            height: 960
        },
        headless: 'new',
        ignoreHTTPSErrors: true,
        executablePath: executablePath(),
    });
    
    try{
        const page = await browser.newPage();
        
        //console.log('go to url');
        await page.goto( link, { waitUntil: 'domcontentloaded', timeout: 16000 } );
        
        //console.log('waits');
        await page.waitForTimeout(6000);
        
        //console.log('takes screenshot');
        await page.screenshot({ path: image_path + image_name });
        
        //console.log('extract html');
        html_content = await page.content();
        
        //console.log('closes browser');
        await browser.close();
        
    } catch (e) {
        console.log('deu ruim: ', e);
        return { error: true, img: '' };
    }
    
    // regex to catch the page tittle (it usually has the name of the product)
    var title = html_content.match(/<title>(.*?)<\/title>/si);
    
    // regex to get currency and price
    var price = html_content.match(/"price":( )*(")?(.*?)(")?( )*(,|})|"priceAmount":( )*(")?(.*?)(")?( )*(,|})/i);
    var currency = html_content.match(/"priceCurrency":( )*"(.*?)",|"currencySymbol":( )*"(.*?)",/i);
    
    title = ( title && title[1] ? title[1] : link );
    
    price = ( price && (price[3] || price[9]) ? (price[3] || price[9]) : null ) ;
    
    currency = ( currency && (currency[2] || currency[4]) ? (currency[2] || currency[4]) : '' );
    
    
    // The screenshot will be saved unter your app's foder on the "public" directory and will be available on http://localhost:3000 (you can change the port on index.js)
    // The embed message requires a valid url to the image file.
    
    const image = process.env.PUBLIC_URL + image_name;
    return { error: false, url: image, title: title.substring(0, 255), price: price, currency: currency };
}
