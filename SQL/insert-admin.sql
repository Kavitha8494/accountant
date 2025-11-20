-- Insert or update admin user
-- Username: admin
-- Password: 123456

-- Check if admin exists, if yes update, if no insert
INSERT INTO admin (USER_NAME, PASSWORD) 
VALUES ('admin', '123456')
ON DUPLICATE KEY UPDATE PASSWORD = '123456';

-- Alternative: If you want to delete existing and insert fresh
-- DELETE FROM admin WHERE USER_NAME = 'admin';
-- INSERT INTO admin (USER_NAME, PASSWORD) VALUES ('admin', '123456');

