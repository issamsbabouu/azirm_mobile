import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export default async function sendEmail(req, res) {
    const { to, subject, text, attachment, filename } = req.body;

    const msg = {
        to,
        from: 'issam.sbabou2002@gmail.com',
        subject,
        text,
        attachments: [
            {
                content: attachment,
                filename,
                type: 'application/pdf',
                disposition: 'attachment',
            },
        ],
    };

    try {
        await sgMail.send(msg);
        res.status(200).send('Email sent');
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).send('Error sending email');
    }
}
