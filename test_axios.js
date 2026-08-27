import axios from 'axios';
import FormData from 'form-data';

const fd = new FormData();
fd.append('test', 'value');

const config = { headers: { 'Content-Type': 'multipart/form-data' } };

// intercept to see what is sent
axios.interceptors.request.use(req => {
  console.log('Headers sent by axios:', req.headers);
  return req;
});

axios.post('http://httpbin.org/post', fd, config).then(res => {
  console.log('Response:', res.data.headers);
}).catch(console.error);
