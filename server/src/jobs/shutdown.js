/**
 * 概述：兼容旧引用路径，转发到 bootstrap 层的优雅关闭注册器。
 */
module.exports = {
  registerShutdown: require('../bootstrap/register-shutdown')
};
