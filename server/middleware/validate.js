 // middleware/validate.js
 // Input validation schemas using express-validator.

const { body, param, validationResult } = require("express-validator");


// Run validation and return errors if any.

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    return res.status(400).json({ error: messages[0], errors: messages });
  }
  next();
}

// Auth validation
const loginRules = [
  body("email").isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters."),
  body("role").isIn(["student", "teacher", "admin"]).withMessage("Invalid role."),
  handleValidation,
];

const forgotPasswordRules = [
  body("email").isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
  handleValidation,
];

const verifyOtpRules = [
  body("email").isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
  body("otp").matches(/^\d{6}$/).withMessage("OTP must be a 6-digit number."),
  handleValidation,
];

const resetPasswordRules = [
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters."),
  handleValidation,
];

//Notes validators 

const noteUploadRules = [
  body("title").trim().notEmpty().withMessage("Title is required.").isLength({ max: 200 }),
  body("subject").trim().notEmpty().withMessage("Subject is required.").isLength({ max: 100 }),
  body("course").optional().trim().isLength({ max: 100 }),
  body("description").optional().trim().isLength({ max: 1000 }),
  handleValidation,
];

/* Assignment validators */

const createAssignmentRules = [
  body("title").trim().notEmpty().withMessage("Title is required.").isLength({ max: 200 }),
  body("subject").trim().notEmpty().withMessage("Subject is required.").isLength({ max: 100 }),
  body("description").optional().trim().isLength({ max: 2000 }),
  body("deadline").notEmpty().withMessage("Deadline is required.").isISO8601().withMessage("Invalid date format."),
  body("course").optional().trim().isLength({ max: 100 }),
  handleValidation,
];

/* Profile validators */

const updateProfileRules = [
  body("first_name").optional().trim().isLength({ max: 50 }),
  body("last_name").optional().trim().isLength({ max: 50 }),
  body("bio").optional().trim().isLength({ max: 500 }),
  body("course").optional().trim().isLength({ max: 100 }),
  body("subject").optional().trim().isLength({ max: 100 }),
  handleValidation,
];

/* Student creation validators */

const addStudentRules = [
  body("email").isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters."),
  body("first_name").trim().notEmpty().withMessage("First name is required.").isLength({ max: 50 }),
  body("last_name").trim().notEmpty().withMessage("Last name is required.").isLength({ max: 50 }),
  body("course").optional().trim().isLength({ max: 100 }),
  handleValidation,
];

/* Attendance validators */

const saveAttendanceRules = [
  body("date").notEmpty().withMessage("Date is required."),
  body("class_name").notEmpty().withMessage("Class is required."),
  body("subject").notEmpty().withMessage("Subject is required."),
  body("records").isArray({ min: 1 }).withMessage("At least one attendance record is required."),
  handleValidation,
];

/* ID param validator */
const idParamRule = [
  param("id").notEmpty().withMessage("ID is required."),
  handleValidation,
];

module.exports = {
  loginRules,
  forgotPasswordRules,
  verifyOtpRules,
  resetPasswordRules,
  noteUploadRules,
  createAssignmentRules,
  updateProfileRules,
  addStudentRules,
  saveAttendanceRules,
  idParamRule,
};