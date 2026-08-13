import axios from 'axios';
axios.get('http://127.0.0.1:8000/api/mentor-profile/')
  .then(res => console.log(JSON.stringify(res.data, null, 2)))
  .catch(err => console.error(err.message));
