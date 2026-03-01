export default function handler(req, res) {
    return res.status(410).json({
        error: 'This endpoint has been permanently removed for security reasons.',
        message: 'Use Supabase Dashboard SQL Editor for database operations.'
    });
}
