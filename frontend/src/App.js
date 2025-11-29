import React from 'react';
// URL бэкенда
const API_URL = 'https://vorhitalone-generatornumbers-46cd.twc1.net';

// Пример запроса
export const getData = async () => {
  try {
    const response = await fetch(`${API_URL}/api/data`); // замени на свой endpoint
    if (!response.ok) throw new Error('Ошибка сети');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Ошибка запроса к бэкенду:', error);
  }
};

function App() {
  return (
    <div>
      <h1>Hello, React!</h1>
    </div>
  );
}


export default App;
