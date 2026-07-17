let responseTime = 850;
let sla = 1000;
let slaStatus = responseTime <= sla ? "Within sla" : "Timeout";
console.log(slaStatus);
console.log(`Response is ${slaStatus}`);  //templateLiteral