def my_factorial(k):
    if k < 0:
        raise ValueError("Факториал определен только для неотрицательных целых чисел")
    
    if k == 0 or k == 1:
        return 1
    
    result = 1
    for i in range(2, k + 1):
        result *= i
    
    return result
