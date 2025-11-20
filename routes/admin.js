const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Admin Login Page
router.get('/login', (req, res) => {
    // If already logged in, redirect to news page
    if (req.session.adminLoggedIn) {
        return res.redirect('/admin/news');
    }
    res.render('admin/login', { error: null, success: null });
});

router.get('/', (req, res) => {
        return res.redirect('/admin/login');
});

// Admin Login API
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.render('admin/login', { 
                error: 'Username and password are required',
                success: null 
            });
        }

        // Query admin from database
        const [admins] = await db.execute(
            'SELECT * FROM admin WHERE USER_NAME = ?',
            [username]
        );

        if (admins.length === 0) {
            return res.render('admin/login', { 
                error: 'Invalid username or password',
                success: null 
            });
        }

        const admin = admins[0];

        // Validate password
        // Check if password is hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
        const isHashed = admin.PASSWORD.startsWith('$2a$') || 
                        admin.PASSWORD.startsWith('$2b$') || 
                        admin.PASSWORD.startsWith('$2y$');
        
        let isPasswordValid = false;
        
        if (isHashed) {
            // Password is hashed, use bcrypt comparison
            try {
                isPasswordValid = await bcrypt.compare(password, admin.PASSWORD);
            } catch (err) {
                console.error('Bcrypt comparison error:', err);
                isPasswordValid = false;
            }
        } else {
            // Password is plain text, do direct comparison
            isPasswordValid = (admin.PASSWORD === password);
        }

        if (!isPasswordValid) {
            return res.render('admin/login', { 
                error: 'Invalid username or password',
                success: null 
            });
        }

        // Set session
        req.session.adminLoggedIn = true;
        req.session.adminId = admin.ID;
        req.session.adminUsername = admin.USER_NAME;

        // Redirect to news page
        res.redirect('/admin/news');
    } catch (error) {
        console.error('Login error:', error);
        res.render('admin/login', { 
            error: 'An error occurred during login. Please try again.',
            success: null 
        });
    }
});

// Middleware to check if admin is logged in
const requireAuth = (req, res, next) => {
    if (req.session.adminLoggedIn) {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

// Admin Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/admin/login');
    });
});

// News Management Page with Pagination
router.get('/news', requireAuth, async (req, res) => {
    try {
        const searchQuery = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 5; // 5 items per page
        const offset = (page - 1) * limit;
        
        let news, totalCount;
        let whereClause = '';
        let queryParams = [];
        
        if (searchQuery) {
            whereClause = 'WHERE CONTENT_NAME LIKE ? OR CONTENT_URL LIKE ? OR TYPE LIKE ?';
            queryParams = [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`];
        }
        
        // Get total count for pagination
        let countResult;
        if (searchQuery) {
            [countResult] = await db.execute(
                `SELECT COUNT(*) as total FROM news ${whereClause}`,
                queryParams
            );
        } else {
            [countResult] = await db.execute('SELECT COUNT(*) as total FROM news');
        }
        
        totalCount = countResult[0].total;
        const totalPages = Math.ceil(totalCount / limit);
        
        // Get paginated news
        if (searchQuery) {
            queryParams.push(limit, offset);
            [news] = await db.execute(
                `SELECT * FROM news ${whereClause} ORDER BY TIMESTAMP DESC LIMIT ? OFFSET ?`,
                queryParams
            );
        } else {
            [news] = await db.execute(
                'SELECT * FROM news ORDER BY TIMESTAMP DESC LIMIT ? OFFSET ?',
                [limit, offset]
            );
        }

        res.render('admin/news', { 
            news: news || [],
            searchQuery: searchQuery,
            adminUsername: req.session.adminUsername,
            currentPage: page,
            totalPages: totalPages,
            totalCount: totalCount,
            limit: limit
        });
    } catch (error) {
        console.error('Error fetching news:', error);
        res.render('admin/news', { 
            news: [],
            searchQuery: '',
            adminUsername: req.session.adminUsername,
            currentPage: 1,
            totalPages: 0,
            totalCount: 0,
            limit: 5,
            error: 'Error loading news data'
        });
    }
});

// Add News Page
router.get('/news/add', requireAuth, (req, res) => {
    res.render('admin/add-news', {
        adminUsername: req.session.adminUsername
    });
});

// Add News API
router.post('/news/add', requireAuth, async (req, res) => {
    try {
        const { type, contentName, contentUrl } = req.body;

        // Validation
        if (!type || !contentName || !contentUrl) {
            return res.render('admin/add-news', {
                adminUsername: req.session.adminUsername,
                error: 'All fields are required',
                formData: req.body
            });
        }

        // Validate type
        const validTypes = ['Business', 'National', 'International'];
        if (!validTypes.includes(type)) {
            return res.render('admin/add-news', {
                adminUsername: req.session.adminUsername,
                error: 'Invalid type selected',
                formData: req.body
            });
        }

        // Validate URL format
        try {
            new URL(contentUrl);
        } catch (e) {
            return res.render('admin/add-news', {
                adminUsername: req.session.adminUsername,
                error: 'Please enter a valid URL',
                formData: req.body
            });
        }

        // Validate content name length
        if (contentName.trim().length < 3) {
            return res.render('admin/add-news', {
                adminUsername: req.session.adminUsername,
                error: 'Content name must be at least 3 characters',
                formData: req.body
            });
        }

        // Insert news into database
        await db.execute(
            'INSERT INTO news (TYPE, CONTENT_NAME, CONTENT_URL) VALUES (?, ?, ?)',
            [type, contentName.trim(), contentUrl.trim()]
        );

        // Redirect to news page with success message
        res.redirect('/admin/news?success=News added successfully');
    } catch (error) {
        console.error('Error adding news:', error);
        res.render('admin/add-news', {
            adminUsername: req.session.adminUsername,
            error: 'An error occurred while adding news. Please try again.',
            formData: req.body
        });
    }
});

// Edit News Page
router.get('/news/edit/:id', requireAuth, async (req, res) => {
    try {
        const newsId = req.params.id;

        if (!newsId) {
            return res.redirect('/admin/news?error=Invalid news ID');
        }

        // Get news from database
        const [news] = await db.execute('SELECT * FROM news WHERE ID = ?', [newsId]);

        if (news.length === 0) {
            return res.redirect('/admin/news?error=News not found');
        }

        res.render('admin/edit-news', {
            adminUsername: req.session.adminUsername,
            news: news[0]
        });
    } catch (error) {
        console.error('Error fetching news for edit:', error);
        res.redirect('/admin/news?error=Error loading news data');
    }
});

// Update News API
router.post('/news/edit/:id', requireAuth, async (req, res) => {
    try {
        const newsId = req.params.id;
        const { type, contentName, contentUrl } = req.body;

        if (!newsId) {
            return res.redirect('/admin/news?error=Invalid news ID');
        }

        // Validation
        if (!type || !contentName || !contentUrl) {
            // Get news data to repopulate form
            const [news] = await db.execute('SELECT * FROM news WHERE ID = ?', [newsId]);
            return res.render('admin/edit-news', {
                adminUsername: req.session.adminUsername,
                news: news[0],
                error: 'All fields are required'
            });
        }

        // Validate type
        const validTypes = ['Business', 'National', 'International'];
        if (!validTypes.includes(type)) {
            const [news] = await db.execute('SELECT * FROM news WHERE ID = ?', [newsId]);
            return res.render('admin/edit-news', {
                adminUsername: req.session.adminUsername,
                news: news[0],
                error: 'Invalid type selected'
            });
        }

        // Validate URL format
        try {
            new URL(contentUrl);
        } catch (e) {
            const [news] = await db.execute('SELECT * FROM news WHERE ID = ?', [newsId]);
            return res.render('admin/edit-news', {
                adminUsername: req.session.adminUsername,
                news: news[0],
                error: 'Please enter a valid URL'
            });
        }

        // Validate content name length
        if (contentName.trim().length < 3) {
            const [news] = await db.execute('SELECT * FROM news WHERE ID = ?', [newsId]);
            return res.render('admin/edit-news', {
                adminUsername: req.session.adminUsername,
                news: news[0],
                error: 'Content name must be at least 3 characters'
            });
        }

        // Check if news exists
        const [existingNews] = await db.execute('SELECT * FROM news WHERE ID = ?', [newsId]);
        if (existingNews.length === 0) {
            return res.redirect('/admin/news?error=News not found');
        }

        // Update news in database
        await db.execute(
            'UPDATE news SET TYPE = ?, CONTENT_NAME = ?, CONTENT_URL = ? WHERE ID = ?',
            [type, contentName.trim(), contentUrl.trim(), newsId]
        );

        // Redirect to news page with success message
        res.redirect('/admin/news?success=News updated successfully');
    } catch (error) {
        console.error('Error updating news:', error);
        res.redirect('/admin/news?error=An error occurred while updating news');
    }
});

// Delete News API
router.delete('/news/:id', requireAuth, async (req, res) => {
    try {
        const newsId = req.params.id;
        
        if (!newsId) {
            return res.status(400).json({ success: false, message: 'News ID is required' });
        }
        
        // Check if news exists
        const [news] = await db.execute('SELECT * FROM news WHERE ID = ?', [newsId]);
        
        if (news.length === 0) {
            return res.status(404).json({ success: false, message: 'News not found' });
        }
        
        // Delete news
        await db.execute('DELETE FROM news WHERE ID = ?', [newsId]);
        
        res.json({ success: true, message: 'News deleted successfully' });
    } catch (error) {
        console.error('Error deleting news:', error);
        res.status(500).json({ success: false, message: 'Error deleting news' });
    }
});

module.exports = router;

