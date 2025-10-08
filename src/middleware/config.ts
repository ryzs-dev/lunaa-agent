import multer from 'multer';

// configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // save into uploads folder
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); // keep the original file name
  },
});

// pass to multer
const multerConfig = multer({ storage });
export default multerConfig;
