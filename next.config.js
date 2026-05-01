/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    DATA_DIR: '/tmp'
  }
}

module.exports = nextConfig